import * as ExcelJS from 'exceljs';
import { Writable } from 'stream';
import { buildDashboardRows } from './dashboard-export.util';

/**
 * Streaming counterpart to `buildDashboardXlsxBuffer`.
 *
 * Same trade-off and approach as `writeMasterXlsxToStream`: reuse the
 * existing pure row builder (`buildDashboardRows`) for the row shape,
 * then stream rows through `ExcelJS.stream.xlsx.WorkbookWriter` instead
 * of materializing a Buffer.
 *
 * Forced text format: only `Hotel ID*` here (the equivalent in the
 * synchronous path applies the same column-text format). The trailing
 * asterisk is part of the actual header — see `DASHBOARD_EXPORT_HEADER`.
 */
export async function writeDashboardXlsxToStream(
  jobs: any[],
  writable: Writable,
): Promise<void> {
  const { headers, rows } = buildDashboardRows(jobs);

  const TEXT_COLUMNS = new Set(['Hotel ID*']);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: writable,
    useStyles: true,
    useSharedStrings: false,
  });

  const worksheet = workbook.addWorksheet('Dashboard');

  worksheet.columns = headers.map((h) => ({ header: h, key: h, width: 20 }));
  for (const col of worksheet.columns) {
    if (col.key && TEXT_COLUMNS.has(col.key)) {
      col.numFmt = '@';
    }
  }
  worksheet.getRow(1).commit();

  for (const row of rows) {
    const out: Record<string, string | number> = {};
    for (const header of headers) {
      let value: any = (row as any)[header];
      if (TEXT_COLUMNS.has(header) && value !== null && value !== undefined) {
        value = String(value);
      }
      out[header] = value;
    }
    worksheet.addRow(out).commit();
  }

  worksheet.commit();
  await workbook.commit();
}
