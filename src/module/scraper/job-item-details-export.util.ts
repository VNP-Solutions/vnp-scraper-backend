import * as XLSX from 'xlsx';
import { formatImportCompatibleDate } from '../../common/utils/import-compatible-date.util';

/**
 * "Export with details" for job items — a separate export from the
 * Master CSV export (`master-export.util.ts`). This one is dedicated to
 * surfacing the VCC Remaining Balance Engine fields for a job's items,
 * so ops can see the computed verdict/recommendation without opening
 * Mongo.
 *
 * Card activity (`authorizations` / `settlements`) is intentionally NOT
 * included here — this export is scoped to the item-level VCC fields
 * only.
 *
 * DO NOT touch `master-export.util.ts` for this — that file backs the
 * existing Master CSV/XLSX export and must stay exactly as-is.
 */

/** Column order (one row per job item). */
export const JOB_ITEM_DETAILS_HEADER: string[] = [
  'Reservation ID',
  'Confirmation Number',
  'Guest Name',
  'Check In',
  'Check Out',
  'Room Type',
  'Booking Amount',
  'Booked Date',
  'Reservation Status',
  'Activity Rows',
  'Posted Charges',
  'Posted Refunds',
  'Net Collected',
  'Implied Card Limit',
  'Still Owed',
  'Safe To Charge Now',
  'Phantom Balance',
  'Owed But Not On Card',
  'Verdict',
  'Red Flags',
  'Times Declined At This Amount',
  'Recommended Action',
];

/**
 * Builds one row for a job item. Every column comes straight off the
 * `JobItem` document itself — no `cardActivity` relation is read here.
 */
export function buildJobItemDetailsRow(
  item: any,
): Record<string, string | number> {
  const row: Record<string, string | number> = {};

  row['Reservation ID'] = item?.reservation_id ?? '';
  row['Confirmation Number'] = item?.confirmation_number ?? '';
  row['Guest Name'] = item?.guest_name ?? '';
  row['Check In'] = formatImportCompatibleDate(item?.check_in_date);
  row['Check Out'] = formatImportCompatibleDate(item?.check_out_date);
  row['Room Type'] = item?.room_type ?? '';
  row['Booking Amount'] =
    item?.booking_amount !== null && item?.booking_amount !== undefined
      ? item.booking_amount
      : '';
  row['Booked Date'] = formatImportCompatibleDate(item?.booked_date);
  row['Reservation Status'] = item?.reservation_status ?? '';

  // VCC Remaining Balance Engine fields — Expedia GraphQL flow only.
  // Absent/null on Booking/Agoda items and on rows scraped before this
  // feature; both render as an empty cell here (never invented).
  row['Activity Rows'] = item?.activityRows ?? '';
  row['Posted Charges'] = item?.postedCharges ?? '';
  row['Posted Refunds'] = item?.postedRefunds ?? '';
  row['Net Collected'] = item?.netCollected ?? '';
  row['Implied Card Limit'] = item?.impliedCardLimit ?? '';
  row['Still Owed'] = item?.stillOwed ?? '';
  row['Safe To Charge Now'] = item?.safeToChargeNow ?? '';
  row['Phantom Balance'] = item?.phantomBalance ?? '';
  row['Owed But Not On Card'] = item?.owedButNotOnCard ?? '';
  row['Verdict'] = item?.verdict ?? '';
  row['Red Flags'] = Array.isArray(item?.redFlags)
    ? item.redFlags.join('; ')
    : '';
  row['Times Declined At This Amount'] =
    item?.timesDeclinedAtThisAmount ?? '';
  row['Recommended Action'] = item?.recommendedAction ?? '';

  return row;
}

/**
 * Builds every row for the given items using the fixed
 * {@link JOB_ITEM_DETAILS_HEADER} column order.
 */
export function buildJobItemDetailsRows(items: any[]): {
  headers: string[];
  rows: Record<string, string | number>[];
} {
  const rows = (items || []).map((item) => buildJobItemDetailsRow(item));
  return { headers: [...JOB_ITEM_DETAILS_HEADER], rows };
}

/**
 * Builds the XLSX buffer for the "export with details" endpoint.
 */
export function buildJobItemDetailsXlsxBuffer(items: any[]): Buffer {
  const { headers, rows } = buildJobItemDetailsRows(items);
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Job Items Detail');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
