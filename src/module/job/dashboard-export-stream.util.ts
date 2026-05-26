import { Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Writable } from 'stream';
import {
  buildDashboardRowsForJob,
  getDashboardHeaders,
} from './dashboard-export.util';

const logger = new Logger('DashboardExportStream');

/**
 * Streaming counterpart to `buildDashboardXlsxBuffer`.
 *
 * Same trade-off and approach as `writeMasterXlsxToStream`: per-job row
 * materialization (`buildDashboardRowsForJob`) feeds an ExcelJS
 * WorkbookWriter, so peak memory stays bounded by ONE job's row count
 * regardless of how many jobs we're exporting. The previous version
 * called `buildDashboardRows(jobs)` upfront and materialized every row
 * before streaming, which OOM-crashed for large consolidated exports.
 *
 * Forced text format: only `Hotel ID*` here (the equivalent in the
 * synchronous path applies the same column-text format). The trailing
 * asterisk is part of the actual header — see `DASHBOARD_EXPORT_HEADER`.
 */
export async function writeDashboardXlsxToStream(
  jobs: any[],
  writable: Writable,
): Promise<void> {
  const headers = getDashboardHeaders();

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

  const totalJobs = jobs.length;
  const logEvery = Math.max(1, Math.floor(totalJobs / 20)); // ~5% increments
  let rowsWritten = 0;
  let jobsWithRows = 0;
  const writeStartedAt = Date.now();

  for (let i = 0; i < totalJobs; i++) {
    const job = jobs[i];
    const jobRows = buildDashboardRowsForJob(job);
    if (jobRows.length > 0) {
      jobsWithRows += 1;
      for (const row of jobRows) {
        const out: Record<string, string | number> = {};
        for (const header of headers) {
          let value: any = (row as any)[header];
          if (
            TEXT_COLUMNS.has(header) &&
            value !== null &&
            value !== undefined
          ) {
            value = String(value);
          }
          out[header] = value;
        }
        worksheet.addRow(out).commit();
      }
      rowsWritten += jobRows.length;
    }
    // jobRows is now garbage-collectable. Peak heap stays bounded.

    if ((i + 1) % logEvery === 0 || i === totalJobs - 1) {
      const pct = Math.round(((i + 1) / totalJobs) * 100);
      logger.log(
        `[Dashboard XLSX] ${i + 1}/${totalJobs} jobs streamed ` +
          `(${pct}%, ${rowsWritten} rows so far, ` +
          `${Date.now() - writeStartedAt}ms elapsed)`,
      );
    }
  }

  worksheet.commit();
  await workbook.commit();
  logger.log(
    `[Dashboard XLSX] Stream finalized — ${rowsWritten} rows across ` +
      `${jobsWithRows}/${totalJobs} jobs in ${Date.now() - writeStartedAt}ms`,
  );
}
