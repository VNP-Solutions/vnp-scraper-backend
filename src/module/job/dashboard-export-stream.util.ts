import { Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Writable } from 'stream';
import {
  buildDashboardRowsForJob,
  getDashboardHeaders,
} from './dashboard-export.util';

const logger = new Logger('DashboardExportStream');

/**
 * True-streaming counterpart to `buildDashboardXlsxBuffer`.
 *
 * Same trade-off and approach as `writeMasterXlsxToStream`: consumes an
 * async iterable of jobs (the cursor pattern) so peak heap stays bounded
 * by ONE in-flight job's rows regardless of how many jobs we're
 * exporting. The dashboard's column shape is fully static — no
 * Expedia-only columns, no cross-job aggregates — so no precomputed
 * context is needed (the master writer takes one for the Expedia
 * "Approved Amount K" columns; the dashboard does not).
 *
 * Forced text format: only `Hotel ID*` here (the equivalent in the
 * synchronous path applies the same column-text format). The trailing
 * asterisk is part of the actual header — see `DASHBOARD_EXPORT_HEADER`.
 */
export async function writeDashboardXlsxToStream(
  jobs: AsyncIterable<any>,
  writable: Writable,
): Promise<{ rowsWritten: number; jobsProcessed: number }> {
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

  let rowsWritten = 0;
  let jobsProcessed = 0;
  let jobsWithRows = 0;
  const writeStartedAt = Date.now();
  const LOG_EVERY_JOBS = 50;

  for await (const job of jobs) {
    jobsProcessed += 1;
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

    if (jobsProcessed % LOG_EVERY_JOBS === 0) {
      logger.log(
        `[Dashboard XLSX] ${jobsProcessed} jobs streamed ` +
          `(${rowsWritten} rows written, ` +
          `${Date.now() - writeStartedAt}ms elapsed)`,
      );
    }
  }

  worksheet.commit();
  await workbook.commit();
  logger.log(
    `[Dashboard XLSX] Stream finalized — ${rowsWritten} rows across ` +
      `${jobsWithRows}/${jobsProcessed} jobs in ${Date.now() - writeStartedAt}ms`,
  );

  return { rowsWritten, jobsProcessed };
}
