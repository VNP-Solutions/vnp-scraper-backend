import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { applyExcelTextColumnFormat } from '../../common/utils/excel-text-column.util';
import {
  OTA_POST_PRE_CHARGING_ACCOUNT_TYPE,
  OTA_POST_PRE_CHARGING_BILLING_INFO,
  OTA_POST_PRE_CHARGING_EXPORT_HEADER,
  OTA_POST_PRE_CHARGING_REQUIRED_IMPORT_COLUMNS,
  OtaPostPreChargingProvider,
} from './ota-post-pre-charging.constants';

const IMPORT_COLUMN_ALIASES: Record<string, string[]> = {
  OTA: ['OTA'],
  'OTA ID': ['OTA ID'],
  Portfolio: ['Portfolio'],
  'Property Name': ['Property Name'],
  'Reservation ID': ['Reservation ID'],
  Currency: ['Currency'],
  'Amount to Charge': ['Amount to Charge'],
  'Card Number': ['Card Number'],
  'Expiry date': ['Expiry date'],
  CVV: ['CVV'],
};

export type ResolvedImportHeaders = Record<string, string>;

function normalizeHeaderKey(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function buildHeaderLookup(headers: string[]): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const header of headers) {
    const normalized = normalizeHeaderKey(header);
    lookup.set(normalized, header);
  }

  return lookup;
}

function resolveImportHeader(
  lookup: Map<string, string>,
  canonicalName: string,
): string | undefined {
  const aliases = IMPORT_COLUMN_ALIASES[canonicalName] ?? [canonicalName];

  for (const alias of aliases) {
    const match = lookup.get(alias);
    if (match) {
      return match;
    }
  }

  for (const [normalized, original] of lookup.entries()) {
    for (const alias of aliases) {
      if (normalized === alias) {
        return original;
      }
    }
  }

  return undefined;
}

export function getImportCellValue(
  row: Record<string, unknown>,
  headerName?: string,
): string {
  if (!headerName) {
    return '';
  }

  const raw = row[headerName];
  if (raw == null) {
    return '';
  }

  if (raw instanceof Date) {
    return raw.toISOString();
  }

  return String(raw).trim();
}

function normalizeOtaProvider(value: string): OtaPostPreChargingProvider | null {
  const normalized = value.trim().toLowerCase();

  if (normalized === 'expedia') {
    return 'Expedia';
  }

  if (normalized === 'booking') {
    return 'Booking';
  }

  if (normalized === 'agoda') {
    return 'Agoda';
  }

  return null;
}

export function isImportFileCsv(fileName: string, mimetype?: string): boolean {
  const lowerName = fileName.toLowerCase();
  return (
    lowerName.endsWith('.csv') ||
    mimetype === 'text/csv' ||
    mimetype === 'application/csv'
  );
}

export function countImportDataRows(
  file: Express.Multer.File,
): number {
  if (isImportFileCsv(file.originalname, file.mimetype)) {
    const lineCount = file.buffer
      .toString('utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0).length;

    return Math.max(lineCount - 1, 0);
  }

  const workbook = XLSX.read(file.buffer, {
    type: 'buffer',
    bookSheets: false,
    cellDates: false,
    cellNF: false,
    cellStyles: false,
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return 0;
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet?.['!ref']) {
    return 0;
  }

  const range = XLSX.utils.decode_range(worksheet['!ref']);
  return Math.max(range.e.r - range.s.r, 0);
}

export function buildResolvedImportHeaders(headers: string[]): ResolvedImportHeaders {
  const lookup = buildHeaderLookup(headers);
  const resolvedHeaders: ResolvedImportHeaders = {};
  const missingColumns: string[] = [];

  for (const column of OTA_POST_PRE_CHARGING_REQUIRED_IMPORT_COLUMNS) {
    const resolved = resolveImportHeader(lookup, column);

    if (!resolved) {
      missingColumns.push(column);
      continue;
    }

    resolvedHeaders[column] = resolved;
  }

  if (missingColumns.length > 0) {
    throw new BadRequestException(
      `Uploaded file is missing required column(s): ${missingColumns.join(', ')}`,
    );
  }

  return resolvedHeaders;
}

export function rowValuesToImportRecord(
  headers: string[],
  values: unknown[],
): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  headers.forEach((header, index) => {
    if (!header) return;
    record[header] = values[index] ?? '';
  });

  return record;
}

export function isImportRowEmpty(
  row: Record<string, unknown>,
  resolvedHeaders: ResolvedImportHeaders,
): boolean {
  return !OTA_POST_PRE_CHARGING_REQUIRED_IMPORT_COLUMNS.some((column) =>
    getImportCellValue(row, resolvedHeaders[column]),
  );
}

export function convertImportRow(
  row: Record<string, unknown>,
  resolvedHeaders: ResolvedImportHeaders,
  rowNumber: number,
): Record<string, string | number> {
  const otaRaw = getImportCellValue(row, resolvedHeaders.OTA);
  const otaProvider = normalizeOtaProvider(otaRaw);

  if (!otaProvider) {
    throw new BadRequestException(
      `Row ${rowNumber}: unsupported OTA value "${otaRaw}". Expected Expedia, Booking, or Agoda.`,
    );
  }

  const billing = OTA_POST_PRE_CHARGING_BILLING_INFO[otaProvider];
  const amountRaw = getImportCellValue(row, resolvedHeaders['Amount to Charge']);
  const amountToCharge =
    amountRaw === ''
      ? ''
      : Number.isNaN(Number(amountRaw))
        ? amountRaw
        : Number(amountRaw);

  return {
    'Account Type': OTA_POST_PRE_CHARGING_ACCOUNT_TYPE,
    'OTA ID': getImportCellValue(row, resolvedHeaders['OTA ID']),
    Portfolio: getImportCellValue(row, resolvedHeaders.Portfolio),
    Subportfolio: '',
    'Hotel Name': getImportCellValue(row, resolvedHeaders['Property Name']),
    ReservationID: getImportCellValue(row, resolvedHeaders['Reservation ID']),
    Currency: getImportCellValue(row, resolvedHeaders.Currency),
    'Amount to charge': amountToCharge,
    'Card Number': getImportCellValue(row, resolvedHeaders['Card Number']),
    Expire: getImportCellValue(row, resolvedHeaders['Expiry date']),
    'Card CVV': getImportCellValue(row, resolvedHeaders.CVV),
    'OTA Billing Name': billing.billingName,
    Address: billing.address,
    City: billing.city,
    State: billing.state,
    'Zip Code': billing.zipCode,
    'OTA Name': otaRaw,
    'VNP Work ID (Leave Blank)': '',
    'Charge Status (Leave Blank)': '',
  };
}

export function parseOtaPostPreChargingImportFile(
  file: Express.Multer.File,
): Record<string, unknown>[] {
  const workbook = XLSX.read(file.buffer, {
    type: 'buffer',
    cellDates: true,
    raw: false,
  });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new BadRequestException('Uploaded file does not contain any worksheet');
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
  });

  if (rows.length === 0) {
    throw new BadRequestException('Uploaded file does not contain any data rows');
  }

  return rows;
}

export function validateOtaPostPreChargingImportHeaders(
  rows: Record<string, unknown>[],
): ResolvedImportHeaders {
  const headers = Object.keys(rows[0] ?? {});
  return buildResolvedImportHeaders(headers);
}

export function convertOtaPostPreChargingRows(
  rows: Record<string, unknown>[],
  resolvedHeaders: ResolvedImportHeaders,
): Record<string, string | number>[] {
  return rows
    .filter((row) => !isImportRowEmpty(row, resolvedHeaders))
    .map((row, index) => convertImportRow(row, resolvedHeaders, index + 2));
}

export function buildOtaPostPreChargingWorkbook(
  convertedRows: Record<string, string | number>[],
): { buffer: Buffer; fileName: string } {
  const worksheet = XLSX.utils.json_to_sheet(convertedRows, {
    header: OTA_POST_PRE_CHARGING_EXPORT_HEADER,
  });

  applyExcelTextColumnFormat(worksheet, convertedRows, 'Card Number');
  applyExcelTextColumnFormat(worksheet, convertedRows, 'Expire');
  applyExcelTextColumnFormat(worksheet, convertedRows, 'Card CVV');
  applyExcelTextColumnFormat(worksheet, convertedRows, 'OTA ID');
  applyExcelTextColumnFormat(worksheet, convertedRows, 'ReservationID');

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'OTA Post Pre Charging');

  const buffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;

  return {
    buffer,
    fileName: buildConvertedFileName(),
  };
}

export function buildConvertedFileName(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);

  return `ota-post-pre-charging-${timestamp}.xlsx`;
}

export function parseDelimitedLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}
