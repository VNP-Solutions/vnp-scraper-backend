import { BadRequestException, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as readline from 'readline';
import { Readable, Writable } from 'stream';
import {
  OTA_POST_PRE_CHARGING_EXPORT_HEADER,
} from './ota-post-pre-charging.constants';
import {
  buildConvertedFileName,
  buildResolvedImportHeaders,
  convertImportRow,
  isImportFileCsv,
  isImportRowEmpty,
  parseDelimitedLine,
  ResolvedImportHeaders,
  rowValuesToImportRecord,
} from './ota-post-pre-charging-converter.util';

const logger = new Logger('OtaPostPreChargingExportStream');
const TEXT_COLUMNS = new Set([
  'OTA ID',
  'ReservationID',
  'Card Number',
  'Expire',
  'Card CVV',
]);
const LOG_EVERY_ROWS = 2000;

function createOutputWorkbook(writable: Writable) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: writable,
    useStyles: true,
    useSharedStrings: false,
  });

  const worksheet = workbook.addWorksheet('OTA Post Pre Charging');
  worksheet.columns = OTA_POST_PRE_CHARGING_EXPORT_HEADER.map((header) => ({
    header,
    key: header,
    width: 20,
  }));

  for (const column of worksheet.columns) {
    if (column.key && TEXT_COLUMNS.has(String(column.key))) {
      column.numFmt = '@';
    }
  }

  worksheet.getRow(1).commit();
  return { workbook, worksheet };
}

function writeConvertedRow(
  worksheet: ExcelJS.Worksheet,
  convertedRow: Record<string, string | number>,
): void {
  const output: Record<string, string | number> = {};

  for (const header of OTA_POST_PRE_CHARGING_EXPORT_HEADER) {
    let value: string | number = convertedRow[header] ?? '';
    if (TEXT_COLUMNS.has(header) && value !== '') {
      value = String(value);
    }
    output[header] = value;
  }

  worksheet.addRow(output).commit();
}

async function streamConvertXlsx(
  input: Readable,
  worksheet: ExcelJS.Worksheet,
): Promise<number> {
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(input, {
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
  });

  let resolvedHeaders: ResolvedImportHeaders | null = null;
  let headerLabels: string[] = [];
  let rowsWritten = 0;
  const startedAt = Date.now();

  for await (const worksheetReader of workbookReader) {
    for await (const row of worksheetReader) {
      const values = Array.isArray(row.values)
        ? row.values.slice(1).map((value) =>
            value instanceof Date ? value.toISOString() : value ?? '',
          )
        : [];

      if (!resolvedHeaders) {
        headerLabels = values.map((value) => String(value ?? '').trim());
        resolvedHeaders = buildResolvedImportHeaders(headerLabels);
        continue;
      }

      const importRecord = rowValuesToImportRecord(headerLabels, values);

      if (isImportRowEmpty(importRecord, resolvedHeaders)) {
        continue;
      }

      const convertedRow = convertImportRow(
        importRecord,
        resolvedHeaders,
        row.number,
      );
      writeConvertedRow(worksheet, convertedRow);
      rowsWritten += 1;

      if (rowsWritten % LOG_EVERY_ROWS === 0) {
        logger.log(
          `[OTA Pre-Charging XLSX] ${rowsWritten} rows streamed ` +
            `(${Date.now() - startedAt}ms elapsed)`,
        );
      }
    }
  }

  if (!resolvedHeaders) {
    throw new BadRequestException(
      'Uploaded file does not contain a header row',
    );
  }

  if (rowsWritten === 0) {
    throw new BadRequestException(
      'Uploaded file does not contain any convertible data rows',
    );
  }

  return rowsWritten;
}

async function streamConvertCsv(
  input: Readable,
  worksheet: ExcelJS.Worksheet,
): Promise<number> {
  const reader = readline.createInterface({ input, crlfDelay: Infinity });
  let resolvedHeaders: ResolvedImportHeaders | null = null;
  let headerLabels: string[] = [];
  let rowsWritten = 0;
  let rowNumber = 1;
  const startedAt = Date.now();

  for await (const line of reader) {
    if (!line.trim()) {
      continue;
    }

    const values = parseDelimitedLine(line);

    if (!resolvedHeaders) {
      headerLabels = values.map((value) => value.trim());
      resolvedHeaders = buildResolvedImportHeaders(headerLabels);
      continue;
    }

    rowNumber += 1;
    const importRecord = rowValuesToImportRecord(headerLabels, values);

    if (isImportRowEmpty(importRecord, resolvedHeaders)) {
      continue;
    }

    const convertedRow = convertImportRow(
      importRecord,
      resolvedHeaders,
      rowNumber,
    );
    writeConvertedRow(worksheet, convertedRow);
    rowsWritten += 1;

    if (rowsWritten % LOG_EVERY_ROWS === 0) {
      logger.log(
        `[OTA Pre-Charging CSV] ${rowsWritten} rows streamed ` +
          `(${Date.now() - startedAt}ms elapsed)`,
      );
    }
  }

  if (!resolvedHeaders) {
    throw new BadRequestException(
      'Uploaded file does not contain a header row',
    );
  }

  if (rowsWritten === 0) {
    throw new BadRequestException(
      'Uploaded file does not contain any convertible data rows',
    );
  }

  return rowsWritten;
}

export async function streamOtaPostPreChargingConversion(
  input: Readable,
  sourceFileName: string,
  sourceMimetype: string | undefined,
  writable: Writable,
): Promise<{ rowCount: number; fileName: string }> {
  const { workbook, worksheet } = createOutputWorkbook(writable);
  const startedAt = Date.now();
  const rowCount = isImportFileCsv(sourceFileName, sourceMimetype)
    ? await streamConvertCsv(input, worksheet)
    : await streamConvertXlsx(input, worksheet);

  worksheet.commit();
  await workbook.commit();

  logger.log(
    `[OTA Pre-Charging] Stream finalized — ${rowCount} rows in ` +
      `${Date.now() - startedAt}ms`,
  );

  return {
    rowCount,
    fileName: buildConvertedFileName(),
  };
}
