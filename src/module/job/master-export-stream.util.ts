import { Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Writable } from 'stream';
import {
  buildMasterRowsForJob,
  computeMasterExportContext,
} from './master-export.util';

const logger = new Logger('MasterExportStream');

/**
 * Streaming counterpart to `buildMasterXlsxBuffer` (master-export.util.ts).
 *
 * Reuses the EXACT same row-builder logic as the synchronous Buffer path
 * (via `buildMasterRowsForJob`), so the column shape, OTA-specific rules,
 * and text-format columns stay byte-identical with `/jobs/export-master`.
 * The differences are at the edges:
 *
 *   1. Row materialization is PER-JOB. We never hold more than one job's
 *      worth of rows in memory at once — typically a few hundred KB. This
 *      is what lets a 1000-job consolidated export run inside the default
 *      Node.js heap. The previous implementation called
 *      `buildMasterRows(jobs)` upfront, which materialized hundreds of
 *      thousands of row objects (≈1.7 GB for 944 jobs × ~900 items each)
 *      and OOM-crashed the process before a single byte was streamed.
 *
 *   2. Serialization is streamed via `ExcelJS.stream.xlsx.WorkbookWriter`,
 *      which flushes XLSX bytes into `writable` as we commit rows.
 *      Memory: O(headers + one in-flight row + ExcelJS's internal high-
 *      water mark + one job's row buffer). Independent of total row count.
 *
 * Forced text format (Card Number / Expiry date / CVV): in ExcelJS the
 * idiomatic way is `column.numFmt = '@'` AND writing the value as a
 * string (so Excel doesn't pre-interpret it). We do both — see
 * `TEXT_COLUMNS` and the per-row coercion below.
 *
 * Unwrapping the `="..."` CSV-text-marker: the row builder still emits
 * `="3700 2145 0852 239"` style values to keep the CSV path working.
 * For XLSX cells we strip that wrapper since the column-level text
 * format already handles the same problem.
 */
export async function writeMasterXlsxToStream(
  jobs: any[],
  writable: Writable,
): Promise<void> {
  // Compute headers + Expedia / approved-count aggregates ONCE up front.
  // This walks `jobs` but does NOT materialize any row objects.
  const ctx = computeMasterExportContext(jobs);
  const headers = ctx.headers;

  // The three columns we force to Text format. Header strings MUST
  // match `MASTER_EXPORT_HEADER` exactly (no trailing whitespace).
  const TEXT_COLUMNS = new Set(['Card Number', 'Expiry date', 'CVV']);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: writable,
    // useStyles must be true for column.numFmt to take effect.
    useStyles: true,
    useSharedStrings: false,
  });

  const worksheet = workbook.addWorksheet('Master');

  // Define columns up-front so we can address them by key when writing
  // rows (and so we can set per-column numFmt for the text columns).
  worksheet.columns = headers.map((h) => ({ header: h, key: h, width: 20 }));
  for (const col of worksheet.columns) {
    if (col.key && TEXT_COLUMNS.has(col.key)) {
      col.numFmt = '@'; // Excel "Text" format
    }
  }
  // exceljs writes the header row as soon as columns are defined when
  // using WorkbookWriter — but we still need to .commit() it.
  worksheet.getRow(1).commit();

  // Per-job iteration keeps peak memory bounded by ONE job's row count.
  // We also log periodic progress so long exports (hundreds of jobs) are
  // observable from the server logs instead of looking hung.
  const totalJobs = jobs.length;
  const logEvery = Math.max(1, Math.floor(totalJobs / 20)); // ~5% increments
  let rowsWritten = 0;
  let jobsWithRows = 0;
  const writeStartedAt = Date.now();

  for (let i = 0; i < totalJobs; i++) {
    const job = jobs[i];
    const jobRows = buildMasterRowsForJob(job, ctx);
    if (jobRows.length > 0) {
      jobsWithRows += 1;
      for (const row of jobRows) {
        // Build the cell-value record. We need to:
        //   (a) unwrap the CSV `="..."` text-marker because XLSX cells are
        //       typed and we want the bare string;
        //   (b) coerce text-column values to string so ExcelJS doesn't
        //       reinterpret long digits as numbers.
        const out: Record<string, string | number> = {};
        for (const header of headers) {
          let value: any = (row as any)[header];
          if (typeof value === 'string') {
            const m = value.match(/^="(.*)"$/s);
            if (m) value = m[1].replace(/""/g, '"');
          }
          if (
            TEXT_COLUMNS.has(header) &&
            value !== null &&
            value !== undefined
          ) {
            value = String(value);
          }
          out[header] = value;
        }
        // `addRow(obj)` matches keys against column.key. `.commit()`
        // flushes that row out of the worksheet's in-memory buffer.
        worksheet.addRow(out).commit();
      }
      rowsWritten += jobRows.length;
    }
    // The per-job row array (`jobRows`) is now eligible for GC. The next
    // iteration will allocate a fresh one — peak heap stays bounded.

    if ((i + 1) % logEvery === 0 || i === totalJobs - 1) {
      const pct = Math.round(((i + 1) / totalJobs) * 100);
      logger.log(
        `[Master XLSX] ${i + 1}/${totalJobs} jobs streamed ` +
          `(${pct}%, ${rowsWritten} rows so far, ` +
          `${Date.now() - writeStartedAt}ms elapsed)`,
      );
    }
  }

  worksheet.commit();
  // `workbook.commit()` ends the underlying stream. The caller MUST
  // await it before considering the upload finished.
  await workbook.commit();
  logger.log(
    `[Master XLSX] Stream finalized — ${rowsWritten} rows across ` +
      `${jobsWithRows}/${totalJobs} jobs in ${Date.now() - writeStartedAt}ms`,
  );
}
