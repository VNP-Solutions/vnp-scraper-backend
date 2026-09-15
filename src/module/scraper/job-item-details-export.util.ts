import * as XLSX from 'xlsx';
import { formatImportCompatibleDate } from '../../common/utils/import-compatible-date.util';

/**
 * "Export with details" for job items — a separate export from the
 * Master CSV export (`master-export.util.ts`). This one is dedicated to
 * surfacing the VCC Remaining Balance Engine fields plus the raw
 * `authorizations` / `settlements` card-activity arrays, so ops can see
 * every hold and every posted settlement for a reservation without
 * opening Mongo.
 *
 * DO NOT touch `master-export.util.ts` for this — that file backs the
 * existing Master CSV/XLSX export and must stay exactly as-is.
 */

/** Static column order (one row per job item). */
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
  'Has Card Activity',
  'Total Settlement Amount',
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
 * Renders a `{ amount, currency }` MoneyAmount embed as "{currency}
 * {amount}" (e.g. "USD 418.35"). Falls back to whichever half is present,
 * and to an empty string if both are missing.
 */
function formatMoneyCell(money: any): string {
  if (!money) return '';
  const amount = money.amount;
  const currency = money.currency;
  const hasAmount = amount !== null && amount !== undefined && amount !== '';
  const hasCurrency =
    typeof currency === 'string' && currency.trim().length > 0;
  if (hasCurrency && hasAmount) return `${currency} ${amount}`;
  if (hasAmount) return String(amount);
  if (hasCurrency) return currency as string;
  return '';
}

/**
 * Formats a Date/date-string as "MM/DD/YYYY HH:mm" (UTC). Authorization
 * and settlement timestamps carry time-of-day, which matters when a card
 * has several holds on the same calendar day — plain MM/DD/YYYY would
 * make them indistinguishable.
 */
function formatDateTimeCell(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
}

export interface JobItemDetailsExportContext {
  headers: string[];
  /** Number of "Authorization N ..." column groups reserved in `headers`. */
  maxAuthorizations: number;
  /** Number of "Settlement N ..." column groups reserved in `headers`. */
  maxSettlements: number;
}

/**
 * Walks `items` once to find the highest `authorizations.length` and
 * `settlements.length` seen on any single item's `cardActivity`, then
 * builds the full header list: static columns + that many dynamic
 * "Authorization N ..." groups + that many dynamic "Settlement N ..."
 * groups.
 *
 * This is the same technique `master-export.util.ts` uses for its
 * "Card Activity Approved Amount N" columns — one card activity can have
 * any number of holds/settlements, so the column count is computed from
 * the actual data instead of being fixed.
 */
export function computeJobItemDetailsExportContext(
  items: any[],
): JobItemDetailsExportContext {
  let maxAuthorizations = 0;
  let maxSettlements = 0;

  for (const item of items || []) {
    const auths = item?.cardActivity?.authorizations;
    if (Array.isArray(auths) && auths.length > maxAuthorizations) {
      maxAuthorizations = auths.length;
    }
    const settlements = item?.cardActivity?.settlements;
    if (Array.isArray(settlements) && settlements.length > maxSettlements) {
      maxSettlements = settlements.length;
    }
  }

  const headers: string[] = [...JOB_ITEM_DETAILS_HEADER];
  for (let i = 1; i <= maxAuthorizations; i++) {
    headers.push(
      `Authorization ${i} Date`,
      `Authorization ${i} Status`,
      `Authorization ${i} Auth Code`,
      `Authorization ${i} Decline Code`,
      `Authorization ${i} Amount`,
    );
  }
  for (let i = 1; i <= maxSettlements; i++) {
    headers.push(
      `Settlement ${i} Transaction Date`,
      `Settlement ${i} Post Date`,
      `Settlement ${i} Auth Code`,
      `Settlement ${i} Reference Number`,
      `Settlement ${i} Amount`,
    );
  }

  return { headers, maxAuthorizations, maxSettlements };
}

/**
 * Builds one row for a job item using a precomputed
 * {@link JobItemDetailsExportContext} so every row in the export has the
 * same shape (items with fewer authorizations/settlements than the max
 * just get blank cells for the unused N slots).
 */
export function buildJobItemDetailsRow(
  item: any,
  ctx: JobItemDetailsExportContext,
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
  row['Has Card Activity'] = item?.has_card_activity ? 'Yes' : 'No';
  row['Total Settlement Amount'] = formatMoneyCell(
    item?.cardActivity?.totalSettlementAmount,
  );

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

  // Dynamic per-authorization columns (holds only — never a posted date).
  const auths = Array.isArray(item?.cardActivity?.authorizations)
    ? item.cardActivity.authorizations
    : [];
  for (let i = 0; i < ctx.maxAuthorizations; i++) {
    const auth = auths[i];
    const n = i + 1;
    row[`Authorization ${n} Date`] = auth
      ? formatDateTimeCell(auth.dateTime)
      : '';
    row[`Authorization ${n} Status`] = auth?.status ?? '';
    row[`Authorization ${n} Auth Code`] = auth?.authCode ?? '';
    row[`Authorization ${n} Decline Code`] = auth?.declineCode ?? '';
    row[`Authorization ${n} Amount`] = auth ? formatMoneyCell(auth.amount) : '';
  }

  // Dynamic per-settlement columns (posted/settled money movement,
  // matched back to an authorization by `authCode`).
  const settlements = Array.isArray(item?.cardActivity?.settlements)
    ? item.cardActivity.settlements
    : [];
  for (let i = 0; i < ctx.maxSettlements; i++) {
    const settlement = settlements[i];
    const n = i + 1;
    row[`Settlement ${n} Transaction Date`] = settlement
      ? formatDateTimeCell(settlement.transactionDate)
      : '';
    row[`Settlement ${n} Post Date`] = settlement
      ? formatDateTimeCell(settlement.postDate)
      : '';
    row[`Settlement ${n} Auth Code`] = settlement?.authCode ?? '';
    row[`Settlement ${n} Reference Number`] =
      settlement?.referenceNumber ?? '';
    row[`Settlement ${n} Amount`] = settlement
      ? formatMoneyCell(settlement.amount)
      : '';
  }

  return row;
}

/**
 * Convenience wrapper: computes the context and builds every row in one
 * call. Fine for a single job's items (the expected caller); avoid on
 * huge multi-job batches for the same reason `buildMasterRows` warns
 * against it (materializes every row in memory at once).
 */
export function buildJobItemDetailsRows(items: any[]): {
  headers: string[];
  rows: Record<string, string | number>[];
} {
  const ctx = computeJobItemDetailsExportContext(items);
  const rows = (items || []).map((item) => buildJobItemDetailsRow(item, ctx));
  return { headers: ctx.headers, rows };
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
