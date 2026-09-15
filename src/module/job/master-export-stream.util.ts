import { Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Writable } from 'stream';
import {
  buildMasterExportHeaderMatrix,
  buildMasterRowsForJob,
  computeMasterExportContext,
  isDynamicGroupTextColumn,
  MasterExportContext,
} from './master-export.util';

const logger = new Logger('MasterExportStream');

/**
 * Writes the 2-row MERGED XLSX header (mirrors `buildMasterXlsxBuffer`'s
 * non-streaming header — see `buildMasterExportHeaderMatrix`): row 1 has
 * each "Transaction N" label merged across its 5 sub-columns, row 2 has
 * the per-column sub-labels, and every other column's single label is
 * merged vertically across both rows.
 *
 * MUST be called immediately after `worksheet.columns` is set and BEFORE
 * any data row is committed — ExcelJS's streaming `mergeCells` throws
 * ("Cannot merge already merged cells" / row-out-of-bounds) once a row
 * inside the merge range has already been flushed to the output stream.
 */
function writeMergedHeaderRows(
  worksheet: ExcelJS.Worksheet,
  headers: string[],
): void {
  const { row1, row2, merges } = buildMasterExportHeaderMatrix(headers);
  const headerRow1 = worksheet.getRow(1);
  const headerRow2 = worksheet.getRow(2);
  headers.forEach((_, idx) => {
    headerRow1.getCell(idx + 1).value = row1[idx];
    headerRow2.getCell(idx + 1).value = row2[idx];
  });
  for (const m of merges) {
    worksheet.mergeCells(m.startRow + 1, m.startCol + 1, m.endRow + 1, m.endCol + 1);
  }
  headerRow1.commit();
  headerRow2.commit();
}

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
 * additions). The Expedia "Transaction N" column count depends on the
 * maximum packed (authorizations + settlements) count on any single
 * reservation across the whole batch, so the caller pre-scans cheaply
 * (no row materialization — see
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
  const TEXT_COLUMNS = new Set([
    'OTA ID',
    'Review Collection Date',
    'Check In',
    'Check Out',
    'Card Number',
    'Expiry date',
    'CVV',
  ]);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: writable,
    // useStyles must be true for column.numFmt to take effect.
    useStyles: true,
    useSharedStrings: false,
  });

  const worksheet = workbook.addWorksheet('Master');

  // Define columns up-front so we can address them by key when writing
  // rows (and so we can set per-column numFmt for the text columns).
  // Deliberately omit `header` here — the 2-row merged header below
  // fully replaces ExcelJS's own "write column.header into row 1" trick.
  worksheet.columns = headers.map((h) => ({ key: h, width: 20 }));
  for (const col of worksheet.columns) {
    if (
      col.key &&
      (TEXT_COLUMNS.has(col.key) || isDynamicGroupTextColumn(col.key))
    ) {
      col.numFmt = '@'; // Excel "Text" format
    }
  }
  writeMergedHeaderRows(worksheet, headers);

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
            (TEXT_COLUMNS.has(header) || isDynamicGroupTextColumn(header)) &&
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

/**
 * Builds a single-job XLSX file using ExcelJS streaming and pipes the
 * bytes directly into `writable` as they are produced — no intermediate
 * buffer is ever held in heap.
 *
 * Used by `streamMasterXlsxZip` to feed each per-job XLSX entry directly
 * into archiver via a PassThrough pipe, so archiver can compress and flush
 * to S3 concurrently while ExcelJS is still writing rows. Peak heap cost
 * for a single entry: ExcelJS worksheet rows in flight (~2–5 MB) plus
 * archiver's compression window (~256 KB).
 *
 * Column headers, field order, text-column formatting (Card Number /
 * Expiry date / CVV → Excel Text format) and `="..."` unwrapping are
 * identical to the consolidated-sheet path so the output is byte-compatible.
 *
 * Returns the number of data rows written (0 if the job has no items —
 * the caller should skip empty jobs BEFORE calling this to avoid producing
 * a header-only entry in the ZIP).
 */
export async function writePerJobXlsxToWritable(
  job: any,
  writable: Writable,
): Promise<number> {
  const TEXT_COLUMNS = new Set([
    'OTA ID',
    'Review Collection Date',
    'Check In',
    'Check Out',
    'Card Number',
    'Expiry date',
    'CVV',
  ]);

  // computeMasterExportContext for a single job is instant: one pass
  // over one job's items, no DB round-trips.
  const ctx = computeMasterExportContext([job]);
  const { headers } = ctx;

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: writable,
    useStyles: true,
    useSharedStrings: false,
  });

  const worksheet = workbook.addWorksheet('Master');
  // Deliberately omit `header` here — the 2-row merged header below
  // fully replaces ExcelJS's own "write column.header into row 1" trick.
  worksheet.columns = headers.map((h) => ({ key: h, width: 20 }));
  for (const col of worksheet.columns) {
    if (
      col.key &&
      (TEXT_COLUMNS.has(col.key) || isDynamicGroupTextColumn(col.key))
    ) {
      col.numFmt = '@'; // Excel "Text" format — preserves leading zeros
    }
  }
  writeMergedHeaderRows(worksheet, headers);

  const rows = buildMasterRowsForJob(job, ctx);
  for (const row of rows) {
    const out: Record<string, string | number> = {};
    for (const header of headers) {
      let value: any = (row as any)[header];
      // Strip the CSV `="..."` text-marker — XLSX columns use numFmt instead.
      if (typeof value === 'string') {
        const m = value.match(/^="(.*)"$/s);
        if (m) value = m[1].replace(/""/g, '"');
      }
      if (
        (TEXT_COLUMNS.has(header) || isDynamicGroupTextColumn(header)) &&
        value !== null &&
        value !== undefined
      ) {
        value = String(value);
      }
      out[header] = value;
    }
    worksheet.addRow(out).commit();
  }

  worksheet.commit();
  // workbook.commit() finalises the OOXML zip inside ExcelJS and calls
  // writable.end() — at that point archiver can drain the last bytes.
  await workbook.commit();

  return rows.length;
}
