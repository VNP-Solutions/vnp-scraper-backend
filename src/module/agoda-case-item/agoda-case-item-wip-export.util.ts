/**
 * Builds the "WIP" (work-in-progress) xlsx export for AgodaCaseItem rows —
 * the sheet ops hand off to whoever charges/collects each card.
 */

import * as XLSX from 'xlsx';
import { applyExcelTextColumnFormat } from '../../common/utils/excel-text-column.util';
import { AgodaCaseItemForExport } from './agoda-case-item.interface';

export const AGODA_CASE_ITEM_WIP_EXPORT_HEADER = [
  'Hotel ID',
  'Batch',
  'Posting Type',
  'OTA Provider',
  'Portfolio',
  'Hotel Name',
  'Reservation ID',
  'Name',
  'Check In',
  'Check Out',
  'User Name',
  'Password',
  'Currency',
  'Amount to charge',
  'Retrieval status',
  'Card first 4',
  'Card last 12',
  'Card Expire',
  'Card CVV',
  'isMissing',
  'Charge Status',
  'Declined Status',
  'KIRAT COMMENTS',
  'Charge Before Date',
  'Created By',
] as const;

type WipExportRow = Record<(typeof AGODA_CASE_ITEM_WIP_EXPORT_HEADER)[number], string>;

/**
 * `vcc_card_number` is stored as one plain string. Splits it into the first
 * 4 digits and everything after, which lines up with "last 12" for a
 * standard 16-digit card.
 */
function splitCardNumber(vcc: string | null | undefined): {
  first4: string;
  last12: string;
} {
  const clean = (vcc ?? '').trim();
  if (!clean) return { first4: '', last12: '' };
  return {
    first4: clean.slice(0, 4),
    last12: clean.length > 4 ? clean.slice(4) : '',
  };
}

function buildWipRow(item: AgodaCaseItemForExport): WipExportRow {
  const { first4, last12 } = splitCardNumber(item.vcc_card_number);
  // A property can technically have more than one credentials row on
  // record; the Agoda extranet login is whichever one comes back first,
  // matching how the rest of the codebase resolves property credentials.
  const credentials = item.property?.credentials?.[0];

  return {
    'Hotel ID':
      item.property?.agoda_id != null ? String(item.property.agoda_id) : '',
    Batch: item.batch?.name ?? '',
    'Posting Type': item.posting_type ?? '',
    'OTA Provider': item.ota_provider ?? '',
    Portfolio: item.portfolio?.name ?? '',
    'Hotel Name': item.property?.name ?? '',
    'Reservation ID': item.reservation_id ?? '',
    Name: item.guest_name ?? '',
    'Check In': item.check_in ?? '',
    'Check Out': item.check_out ?? '',
    'User Name': credentials?.agodaUsername ?? '',
    Password: credentials?.agodaPassword ?? '',
    Currency: item.currency ?? '',
    'Amount to charge': item.amount_to_charge ?? '',
    'Retrieval status': item.retrival_status ?? '',
    'Card first 4': first4,
    'Card last 12': last12,
    'Card Expire': item.card_expire ?? '',
    'Card CVV': item.card_cvv ?? '',
    isMissing: item.is_missing ? 'Yes' : 'No',
    'Charge Status': item.charge_status ?? '',
    'Declined Status': item.is_declined ? 'Yes' : 'No',
    // Not tracked anywhere yet — always blank until there's somewhere to
    // read/write these from.
    'KIRAT COMMENTS': '',
    'Charge Before Date': '',
    'Created By': item.creator?.name ?? '',
  };
}

export function buildAgodaCaseItemWipFileName(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);

  return `agoda-case-item-wip-${timestamp}.xlsx`;
}

export function buildAgodaCaseItemWipWorkbook(
  items: AgodaCaseItemForExport[],
): { buffer: Buffer; fileName: string } {
  const rows = items.map(buildWipRow);

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [...AGODA_CASE_ITEM_WIP_EXPORT_HEADER],
  });

  // Force these as plain text so Excel doesn't drop leading zeroes, treat
  // long card numbers as scientific notation, or reinterpret "MM/YY" as a
  // date.
  applyExcelTextColumnFormat(worksheet, rows, 'Hotel ID');
  applyExcelTextColumnFormat(worksheet, rows, 'Reservation ID');
  applyExcelTextColumnFormat(worksheet, rows, 'Card first 4');
  applyExcelTextColumnFormat(worksheet, rows, 'Card last 12');
  applyExcelTextColumnFormat(worksheet, rows, 'Card Expire');
  applyExcelTextColumnFormat(worksheet, rows, 'Card CVV');

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'WIP');

  const buffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;

  return { buffer, fileName: buildAgodaCaseItemWipFileName() };
}
