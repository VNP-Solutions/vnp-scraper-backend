import { Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Writable } from 'stream';
import {
  buildMasterRowsForJob,
  MasterExportContext,
} from './master-export.util';

const logger = new Logger('MasterExportStream');

/**
 * True-streaming counterpart to `buildMasterXlsxBuffer` (master-export.util.ts).
 *
 * Memory profile (the whole point of this file):
 *   - Headers + ExcelJS internal high-water mark   .... ≲ 50 MB
 *   - ONE in-flight job's rows + cell coercion buffer ≲ 5 MB
 *   - One Mongo batch in flight inside the cursor   .... ≲ 20 MB
 *   - S3 multipart upload's queued parts            .... ≲ 20 MB
 *                                                 ─────────────
 *   peak heap                                       ~100 MB
 *
 * — and this is INDEPENDENT of how many jobs we export. The earlier
 * implementation took an `any[]` of pre-loaded jobs and materialized
 * every row up front; with 944 Expedia jobs × ~563 items each that was
 * a 1.7 GB allocation, which OOM-crashed the worker process.
 *
 * Why the writer accepts both an `AsyncIterable<job>` and a precomputed
 * `MasterExportContext`: ExcelJS's `WorkbookWriter` requires column
 * definitions BEFORE the first row is committed (no late column
 * additions). The Expedia "Approved Amount K" column count depends on
 * the maximum number of approved authorizations across the whole batch,
 * so the caller pre-scans cheaply (no row materialization — see
 * `JobRepository.precomputeMasterExportContext`) and hands us the
 * resulting context up front.
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
  jobs: AsyncIterable<any>,
  ctx: MasterExportContext,
  writable: Writable,
): Promise<{ rowsWritten: number; jobsProcessed: number }> {
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

  let rowsWritten = 0;
  let jobsProcessed = 0;
  let jobsWithRows = 0;
  const writeStartedAt = Date.now();
  // Log progress periodically so long-running exports are observable
  // from the server logs. We don't know the total job count up front
  // (it's a cursor), so we log every N jobs based on elapsed jobs.
  const LOG_EVERY_JOBS = 50;

  // `for await` applies natural back-pressure: ExcelJS row commits are
  // synchronous, but Mongo batches are awaited inside the generator,
  // so we never get ahead of either pipeline.
  for await (const job of jobs) {
    jobsProcessed += 1;
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

    if (jobsProcessed % LOG_EVERY_JOBS === 0) {
      logger.log(
        `[Master XLSX] ${jobsProcessed} jobs streamed ` +
          `(${rowsWritten} rows written, ` +
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
      `${jobsWithRows}/${jobsProcessed} jobs in ${Date.now() - writeStartedAt}ms`,
  );

  return { rowsWritten, jobsProcessed };
}
