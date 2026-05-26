import * as ExcelJS from 'exceljs';
import { Writable } from 'stream';
import { buildMasterRows } from './master-export.util';

/**
 * Streaming counterpart to `buildMasterXlsxBuffer` (master-export.util.ts).
 *
 * Reuses the EXACT same row-builder logic (`buildMasterRows`) so the
 * column shape, OTA-specific rules, and text-format columns stay byte-
 * identical with the synchronous SheetJS-based path. The only thing
 * that changes is the serialization layer: instead of materializing
 * the whole workbook in memory and returning a Buffer, we stream rows
 * out through `ExcelJS.stream.xlsx.WorkbookWriter` so memory stays
 * roughly constant regardless of how many jobs we feed in.
 *
 * Memory: O(headers + one in-flight row + ExcelJS's internal high-
 * water mark). For a 10k-job export with 50 items each = 500k rows,
 * peak heap is ~20–40 MB instead of the ~500 MB the buffer path would
 * consume.
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
  const { headers, rows } = buildMasterRows(jobs);

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

  for (const row of rows) {
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
      if (TEXT_COLUMNS.has(header) && value !== null && value !== undefined) {
        value = String(value);
      }
      out[header] = value;
    }
    // `addRow(obj)` matches keys against column.key, returns a Row.
    // Calling `.commit()` flushes that row out of memory.
    worksheet.addRow(out).commit();
  }

  worksheet.commit();
  // `workbook.commit()` ends the underlying stream. The caller MUST
  // await it before considering the upload finished.
  await workbook.commit();
}
