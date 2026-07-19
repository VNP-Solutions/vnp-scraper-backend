import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { applyExcelTextColumnFormat } from '../../common/utils/excel-text-column.util';
import { DASHBOARD_EXPORT_HEADER } from '../job/dashboard-export.util';

const NA = 'N/A';

export const QA_PANEL_MASTER_IMPORT_REQUIRED_COLUMNS = [
  'OTA',
  'OTA ID',
  'Portfolio',
  'Property Name',
  'Reservation ID',
  'Currency',
  'Amount to Charge',
] as const;

const IMPORT_COLUMN_ALIASES: Record<string, string[]> = {
  OTA: ['OTA'],
  'OTA ID': ['OTA ID'],
  Batch: ['Batch'],
  'Review Collection Date': [
    'Review Collection Date',
    'Review/Collection Date',
  ],
  Portfolio: ['Portfolio'],
  'Property Name': ['Property Name', 'Hotel Name'],
  'Reservation ID': ['Reservation ID'],
  'Guest name': ['Guest name', 'Name'],
  'Check In': ['Check In'],
  'Check Out': ['Check Out'],
  Currency: ['Currency'],
  'Amount to Charge': ['Amount to Charge', 'Amount Collected'],
};

export type ResolvedQaPanelMasterHeaders = Record<string, string>;

function normalizeHeaderKey(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function buildHeaderLookup(headers: string[]): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const header of headers) {
    lookup.set(normalizeHeaderKey(header), header);
  }

  return lookup;
}

function resolveImportHeader(
  lookup: Map<string, string>,
  canonicalName: string,
): string | undefined {
  const aliases = IMPORT_COLUMN_ALIASES[canonicalName] ?? [canonicalName];

  for (const alias of aliases) {
    const match = lookup.get(normalizeHeaderKey(alias));
    if (match) {
      return match;
    }
  }

  return undefined;
}

function buildResolvedImportHeaders(headers: string[]): ResolvedQaPanelMasterHeaders {
  const lookup = buildHeaderLookup(headers);
  const resolved: ResolvedQaPanelMasterHeaders = {};

  for (const column of QA_PANEL_MASTER_IMPORT_REQUIRED_COLUMNS) {
    const match = resolveImportHeader(lookup, column);
    if (!match) {
      throw new BadRequestException(
        `Missing required column "${column}" in uploaded file`,
      );
    }
    resolved[column] = match;
  }

  for (const optionalColumn of [
    'Batch',
    'Review Collection Date',
    'Guest name',
    'Check In',
    'Check Out',
  ] as const) {
    const match = resolveImportHeader(lookup, optionalColumn);
    if (match) {
      resolved[optionalColumn] = match;
    }
  }

  return resolved;
}

function getImportCellValue(
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

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function formatDisplayDate(value: Date | string | null | undefined): string {
  if (!value) return '';

  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) {
    return typeof value === 'string' ? value.trim() : '';
  }

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function parseDisplayDate(value: unknown): string {
  if (value instanceof Date) {
    return formatDisplayDate(value);
  }

  if (value == null) {
    return '';
  }

  const text = String(value).trim();
  if (!text || text.toUpperCase() === NA) {
    return text.toUpperCase() === NA ? NA : '';
  }

  return formatDisplayDate(text);
}

function parseAmount(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toUpperCase() === NA) {
      return null;
    }

    const parsed = Number(trimmed.replace(/,/g, ''));
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function normalizeOta(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized === 'expedia') return 'Expedia';
  if (normalized === 'booking') return 'Booking';
  if (normalized === 'agoda') return 'Agoda';

  return value.trim();
}

function isImportRowEmpty(
  row: Record<string, unknown>,
  resolvedHeaders: ResolvedQaPanelMasterHeaders,
): boolean {
  const ota = getImportCellValue(row, resolvedHeaders.OTA);
  const reservationId = getImportCellValue(
    row,
    resolvedHeaders['Reservation ID'],
  );
  const amount = getImportCellValue(row, resolvedHeaders['Amount to Charge']);

  return !ota && !reservationId && !amount;
}

export function parseQaPanelMasterImportFile(
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

export function validateQaPanelMasterImportHeaders(
  rows: Record<string, unknown>[],
): ResolvedQaPanelMasterHeaders {
  const headers = Object.keys(rows[0] ?? {});
  return buildResolvedImportHeaders(headers);
}

export function convertQaPanelMasterRowToDashboardRow(
  row: Record<string, unknown>,
  resolvedHeaders: ResolvedQaPanelMasterHeaders,
): Record<string, string | number> {
  const ota = normalizeOta(getImportCellValue(row, resolvedHeaders.OTA));
  const amountHeader = resolvedHeaders['Amount to Charge'];
  const amountRaw = amountHeader ? row[amountHeader] : undefined;
  const amountToCharge = parseAmount(amountRaw);

  const splitEligible =
    (ota === 'Expedia' || ota === 'Booking') && amountToCharge !== null;
  const dueToProperty = splitEligible
    ? round4((amountToCharge as number) * 0.85)
    : NA;
  const dueToVnp = splitEligible
    ? round4((amountToCharge as number) * 0.15)
    : NA;

  const checkInHeader = resolvedHeaders['Check In'];
  const checkOutHeader = resolvedHeaders['Check Out'];
  const reviewDateHeader = resolvedHeaders['Review Collection Date'];

  const dashboardRow: Record<string, string | number> = {};
  dashboardRow[DASHBOARD_EXPORT_HEADER[0]] = ota;
  dashboardRow[DASHBOARD_EXPORT_HEADER[1]] = getImportCellValue(
    row,
    resolvedHeaders['OTA ID'],
  );
  dashboardRow[DASHBOARD_EXPORT_HEADER[2]] = getImportCellValue(
    row,
    resolvedHeaders.Batch,
  );
  dashboardRow[DASHBOARD_EXPORT_HEADER[3]] = reviewDateHeader
    ? parseDisplayDate(row[reviewDateHeader])
    : '';
  dashboardRow[DASHBOARD_EXPORT_HEADER[4]] = getImportCellValue(
    row,
    resolvedHeaders.Portfolio,
  );
  dashboardRow[DASHBOARD_EXPORT_HEADER[5]] = getImportCellValue(
    row,
    resolvedHeaders['Property Name'],
  );
  dashboardRow[DASHBOARD_EXPORT_HEADER[6]] = getImportCellValue(
    row,
    resolvedHeaders['Reservation ID'],
  );
  dashboardRow[DASHBOARD_EXPORT_HEADER[7]] = 'TBD';
  dashboardRow[DASHBOARD_EXPORT_HEADER[8]] = getImportCellValue(
    row,
    resolvedHeaders['Guest name'],
  );
  dashboardRow[DASHBOARD_EXPORT_HEADER[9]] = checkInHeader
    ? parseDisplayDate(row[checkInHeader])
    : '';
  dashboardRow[DASHBOARD_EXPORT_HEADER[10]] = checkOutHeader
    ? parseDisplayDate(row[checkOutHeader])
    : '';
  dashboardRow[DASHBOARD_EXPORT_HEADER[11]] =
    getImportCellValue(row, resolvedHeaders.Currency) || 'USD';
  dashboardRow[DASHBOARD_EXPORT_HEADER[12]] =
    amountToCharge !== null ? amountToCharge : '';
  dashboardRow[DASHBOARD_EXPORT_HEADER[13]] = dueToProperty;
  dashboardRow[DASHBOARD_EXPORT_HEADER[14]] = dueToVnp;

  return dashboardRow;
}

export function convertQaPanelMasterRowsToDashboardRows(
  rows: Record<string, unknown>[],
  resolvedHeaders: ResolvedQaPanelMasterHeaders,
): Record<string, string | number>[] {
  return rows
    .filter((row) => !isImportRowEmpty(row, resolvedHeaders))
    .map((row) => convertQaPanelMasterRowToDashboardRow(row, resolvedHeaders));
}

export function buildQaPanelDashboardWorkbook(
  convertedRows: Record<string, string | number>[],
): { buffer: Buffer; fileName: string } {
  if (convertedRows.length === 0) {
    throw new BadRequestException(
      'Uploaded file does not contain any convertible data rows',
    );
  }

  const worksheet = XLSX.utils.json_to_sheet(convertedRows, {
    header: [...DASHBOARD_EXPORT_HEADER],
  });

  applyExcelTextColumnFormat(worksheet, convertedRows, 'Hotel ID*');

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Dashboard');

  const buffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;

  return {
    buffer,
    fileName: buildConvertedDashboardFileName(),
  };
}

function buildConvertedDashboardFileName(): string {
  const timestamp = Date.now();
  const formatted = new Date(timestamp).toLocaleString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return `dashboard-report-${formatted}.xlsx`;
}

export function convertQaPanelMasterUploadToDashboard(
  file: Express.Multer.File,
): { buffer: Buffer; fileName: string; rowCount: number } {
  const rows = parseQaPanelMasterImportFile(file);
  const resolvedHeaders = validateQaPanelMasterImportHeaders(rows);
  const convertedRows = convertQaPanelMasterRowsToDashboardRows(
    rows,
    resolvedHeaders,
  );
  const workbook = buildQaPanelDashboardWorkbook(convertedRows);

  return {
    ...workbook,
    rowCount: convertedRows.length,
  };
}
