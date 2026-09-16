import { Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Writable } from 'stream';
import {
  buildCardActivityWideExportHeaderMatrix,
  buildCardActivityWideRowsForJob,
  computeCardActivityWideExportContext,
  isCardActivityWideDynamicGroupTextColumn,
  CardActivityWideExportContext,
} from './card-activity-wide-export.util';

const logger = new Logger('CardActivityWideExportStream');

/**
 * Writes the 2-row MERGED XLSX header (mirrors `buildCardActivityWideXlsxBuffer`'s
 * non-streaming header — see `buildCardActivityWideExportHeaderMatrix`): row 1
 * has each "Transaction N" label merged across its 5 sub-columns, row 2 has
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
  const { row1, row2, merges } = buildCardActivityWideExportHeaderMatrix(headers);
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
 * True-streaming counterpart to `buildCardActivityWideXlsxBuffer`
 * (card-activity-wide-export.util.ts). Same pipeline and memory profile
 * as `writeMasterXlsxToStream` in `master-export-stream.util.ts` — see
 * that file's docs for the full rationale. This is the "wide" sibling
 * used specifically for the `/card-activity-wide-export` endpoints,
 * which add the full Card Activity / Transaction N column set that the
 * plain master export no longer includes.
 */
export async function writeCardActivityWideXlsxToStream(
  jobs: AsyncIterable<any>,
  ctx: CardActivityWideExportContext,
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
      (TEXT_COLUMNS.has(col.key) || isCardActivityWideDynamicGroupTextColumn(col.key))
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
    const jobRows = buildCardActivityWideRowsForJob(job, ctx);
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
            (TEXT_COLUMNS.has(header) ||
              isCardActivityWideDynamicGroupTextColumn(header)) &&
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
        `[CardActivityWide XLSX] ${jobsProcessed} jobs streamed ` +
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
    `[CardActivityWide XLSX] Stream finalized — ${rowsWritten} rows across ` +
      `${jobsWithRows}/${jobsProcessed} jobs in ${Date.now() - writeStartedAt}ms`,
  );

  return { rowsWritten, jobsProcessed };
}

/**
 * Builds a single-job XLSX file using ExcelJS streaming and pipes the
 * bytes directly into `writable` as they are produced — no intermediate
 * buffer is ever held in heap.
 *
 * Used by `streamCardActivityWideXlsxZip` to feed each per-job XLSX entry
 * directly into archiver via a PassThrough pipe, so archiver can compress
 * and flush to S3 concurrently while ExcelJS is still writing rows.
 *
 * Column headers, field order, text-column formatting and `="..."`
 * unwrapping are identical to the consolidated-sheet path so the output
 * is byte-compatible.
 *
 * Returns the number of data rows written (0 if the job has no items —
 * the caller should skip empty jobs BEFORE calling this to avoid producing
 * a header-only entry in the ZIP).
 */
export async function writePerJobCardActivityWideXlsxToWritable(
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

  // computeCardActivityWideExportContext for a single job is instant: one
  // pass over one job's items, no DB round-trips.
  const ctx = computeCardActivityWideExportContext([job]);
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
      (TEXT_COLUMNS.has(col.key) || isCardActivityWideDynamicGroupTextColumn(col.key))
    ) {
      col.numFmt = '@'; // Excel "Text" format — preserves leading zeros
    }
  }
  writeMergedHeaderRows(worksheet, headers);

  const rows = buildCardActivityWideRowsForJob(job, ctx);
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
        (TEXT_COLUMNS.has(header) || isCardActivityWideDynamicGroupTextColumn(header)) &&
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
