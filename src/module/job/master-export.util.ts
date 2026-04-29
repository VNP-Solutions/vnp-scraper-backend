import { OTAProvider, PostingType } from '@prisma/client';

/**
 * Exact column order for the Master export CSV.
 * DO NOT re-order - the output spec depends on this order.
 */
export const MASTER_EXPORT_HEADER: string[] = [
  'OTA',
  'OTA Posting Type',
  'OTA ID',
  'Batch',
  'Review Collection Date',
  'Portfolio',
  'Property Name',
  'Reservation ID',
  'Hotel Confirmation Code',
  'Guest name',
  'Check In',
  'Check Out',
  'Charge Before',
  'Currency',
  'Booking Amount',
  'Amount to Charge',
  'Card Status',
  'Card Number',
  'Expiry date',
  'CVV',
  'Due to Property',
  'Due to VNP/Invoice',
  'Processor (DBMS Based on OTA)',
  'QP Username (From DBMS)',
  'Case Contact (From DBMS)',
  'Reporting Contact (From DBMS)',
];

const NA = 'N/A';
const CARD_ACTIVITY_HEADER = 'Card Activity';
const APPROVED_AMOUNT_HEADER_PREFIX = 'Card Activity Approved Amount';
const CALCULATED_AMOUNT_HEADER = 'Calculated Amount to Charge';
const AMOUNT_MATCH_HEADER = 'Amount Match';

/**
 * Rounds a number to two decimal places. Used to keep the running sum of
 * approved authorization amounts and the comparison against
 * Amount to Charge free from floating-point noise (e.g. 100 - 99.99 - 0.01
 * being 1.4e-16 instead of 0).
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Returns the list of "Approved" authorizations from a job item's
 * cardActivity payload. Always returns an array so callers can `.length`
 * safely; non-Expedia items still pass through here but the rendering
 * layer marks their card-activity / approved-amount cells as N/A.
 */
function getApprovedAuthorizations(item: any): any[] {
  const auths = item?.cardActivity?.authorizations;
  if (!Array.isArray(auths)) return [];
  return auths.filter(
    (a: any) =>
      typeof a?.status === 'string' &&
      a.status.trim().toLowerCase() === 'approved',
  );
}

/**
 * Renders a single approved-authorization amount cell as
 * "{currency} {amount}" (e.g. "CAD 294.87"). Falls back to either the
 * currency or the amount alone if one of them is missing, and to an
 * empty string if both are missing.
 */
function formatApprovedAmountCell(auth: any): string {
  const money = auth?.amount;
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
 * Display value for the OTA posting type column.
 * Sample data shows both "OTA Post" and "OTA " (plain) so we map the
 * Prisma enum to the human-friendly label seen in the spec.
 */
function formatPostingType(type: PostingType | null | undefined): string {
  if (!type) return '';
  switch (type) {
    case PostingType.OTA:
      return 'OTA';
    case PostingType.OTA_PLUS:
      return 'OTA Post';
    default:
      return String(type);
  }
}

/**
 * Returns the OTA provider's property ID (Expedia/Booking/Agoda) from the
 * related property record, based on the job's ota_provider.
 */
function getOtaIdForJob(job: any): string | number {
  const property = job?.property;
  if (!property) return '';
  switch (job?.ota_provider) {
    case OTAProvider.Expedia:
      return property.expedia_id ?? '';
    case OTAProvider.Booking:
      return property.booking_id ?? '';
    case OTAProvider.Agoda:
      return property.agoda_id ?? '';
    default:
      return '';
  }
}

/**
 * Formats a date-like input as "MMM dd, yyyy" (e.g. "Feb 28, 2026")
 * to match the exported samples.
 */
function formatDisplayDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) {
    // If it isn't a parseable date, return the original string unchanged.
    return typeof value === 'string' ? value : '';
  }
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

/**
 * Formats a raw card number into 4-digit groups separated by spaces,
 * e.g. "3700214508552239" -> "3700 2145 0855 2239".
 * Keeps any trailing partial group as-is (sample shows 3-digit trailing).
 */
function formatCardNumber(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Wraps a value so that when the CSV is opened in Excel it is treated as
 * text (prevents stripping of leading zeros, scientific notation on long
 * card numbers, and auto-date-parsing of values like "2031-02").
 *
 * Produces a cell value like: ="3700 2145 0852 239"
 */
function asExcelText(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  // Escape embedded double quotes per CSV/Excel rules.
  const escaped = String(value).replace(/"/g, '""');
  return `="${escaped}"`;
}

/**
 * Builds one CSV row object for a given (job, jobItem) pair, applying the
 * OTA-specific rules described in the spec.
 *
 * Keys in the returned object must exactly match MASTER_EXPORT_HEADER (and
 * the dynamic Card Activity / Approved Amount N columns) so XLSX's
 * json_to_sheet(..., { header }) emits columns in the right order.
 *
 * `approvedAmountColumns` is the number of "Approved Amount N" columns the
 * caller has decided to render for this CSV (the maximum across all rows in
 * the same export). Each row pads its own approved-amount cells up to that
 * count so every row has the same shape.
 */
export function buildMasterRow(
  job: any,
  item: any,
  approvedAmountColumns = 0,
): Record<string, string | number> {
  const ota = job?.ota_provider as OTAProvider | undefined;
  const isExpedia = ota === OTAProvider.Expedia;
  const isBooking = ota === OTAProvider.Booking;

  const amountToCharge: number | null =
    item?.payment_info?.amount_to_charge_or_refund ?? null;

  const row: Record<string, string | number> = {};
  // IMPORTANT: keys here must exactly match the strings in
  // MASTER_EXPORT_HEADER (order-indexed below) so `json_to_sheet` can resolve
  // each cell. If you rename a header, also rename its key here.
  row[MASTER_EXPORT_HEADER[0]] = ota ?? ''; // OTA
  row[MASTER_EXPORT_HEADER[1]] = formatPostingType(job?.posting_type); // OTA Posting Type*
  row[MASTER_EXPORT_HEADER[2]] = getOtaIdForJob(job) || ''; // OTA ID
  row[MASTER_EXPORT_HEADER[3]] = job?.batch?.name ?? ''; // Batch
  row[MASTER_EXPORT_HEADER[4]] = formatDisplayDate(job?.end_date); // Review Collection Date*
  row[MASTER_EXPORT_HEADER[5]] =
    job?.portfolio_name ?? job?.portfolio?.name ?? ''; // Portfolio
  row[MASTER_EXPORT_HEADER[6]] = job?.property_name ?? ''; // Property Name*
  row[MASTER_EXPORT_HEADER[7]] = item?.reservation_id ?? ''; // Reservation ID*
  row[MASTER_EXPORT_HEADER[8]] = isExpedia
    ? (item?.confirmation_number ?? '')
    : NA; // Hotel Confirmation Code (Expedia only)
  row[MASTER_EXPORT_HEADER[9]] = item?.guest_name ?? ''; // Guest name
  // Booking.com exports never carry a check-in / check-out date, so those
  // cells are always "N/A" for that OTA (matches the spec for Booking rows).
  row[MASTER_EXPORT_HEADER[10]] = isBooking
    ? NA
    : formatDisplayDate(item?.check_in_date); // Check In
  row[MASTER_EXPORT_HEADER[11]] = isBooking
    ? NA
    : formatDisplayDate(item?.check_out_date); // Check Out
  row[MASTER_EXPORT_HEADER[12]] = isBooking
    ? (item?.payment_info?.charge_before ?? NA)
    : NA; // Charge Before (Booking only)
  row[MASTER_EXPORT_HEADER[13]] =
    item?.payment_info?.amount_to_charge_or_refund_currency || 'USD'; // Currency
  row[MASTER_EXPORT_HEADER[14]] = isExpedia
    ? item?.booking_amount !== null && item?.booking_amount !== undefined
      ? item.booking_amount
      : NA
    : NA; // Booking Amount (Expedia only)
  row[MASTER_EXPORT_HEADER[15]] = amountToCharge !== null ? amountToCharge : ''; // Amount to Charge
  row[MASTER_EXPORT_HEADER[16]] = isExpedia
    ? (item?.card_info?.reason_for_charge ?? '')
    : NA; // Card Status (Expedia only)
  row[MASTER_EXPORT_HEADER[17]] = asExcelText(
    formatCardNumber(item?.card_info?.card_number),
  ); // Card Number (text)
  row[MASTER_EXPORT_HEADER[18]] = asExcelText(item?.card_info?.expiry_date); // Expiry date (text)
  row[MASTER_EXPORT_HEADER[19]] = asExcelText(item?.card_info?.cvv); // CVV (text)
  row[MASTER_EXPORT_HEADER[20]] = ''; // Due to Property (intentionally blank)
  row[MASTER_EXPORT_HEADER[21]] = ''; // Due to VNP/Invoice (intentionally blank)
  row[MASTER_EXPORT_HEADER[22]] = ''; // Processor
  row[MASTER_EXPORT_HEADER[23]] = ''; // QP Username
  row[MASTER_EXPORT_HEADER[24]] = ''; // Case Contact
  row[MASTER_EXPORT_HEADER[25]] = ''; // Reporting Contact

  // Card Activity + Calculated Amount to Charge + Amount Match + dynamic
  // Approved Amount columns are EXPEDIA-ONLY. For Booking and Agoda these
  // keys are not written at all; buildMasterRows() also omits them from
  // the header so the resulting CSV has just the 26 static columns.
  if (isExpedia) {
    const approved = getApprovedAuthorizations(item);
    row[CARD_ACTIVITY_HEADER] = JSON.stringify(approved);

    // Calculated Amount to Charge = Booking Amount - Σ approved amounts.
    // Authorizations missing a numeric amount contribute 0 to the sum
    // (treated as a no-op rather than an error).
    const sumApproved = approved.reduce(
      (s: number, a: any) =>
        s + (typeof a?.amount?.amount === 'number' ? a.amount.amount : 0),
      0,
    );
    const bookingAmount =
      typeof item?.booking_amount === 'number' ? item.booking_amount : null;
    const calculated =
      bookingAmount !== null ? round2(bookingAmount - sumApproved) : null;
    row[CALCULATED_AMOUNT_HEADER] = calculated !== null ? calculated : '';

    // Amount Match: Yes only when both sides are present and equal after
    // rounding to 2 decimals (matches the precision Booking/Expedia
    // settlement reports operate at). Anything else is "No" — including
    // missing booking_amount or missing amount_to_charge_or_refund.
    const amountToChargeNum =
      typeof amountToCharge === 'number' ? round2(amountToCharge) : null;
    row[AMOUNT_MATCH_HEADER] =
      calculated !== null &&
      amountToChargeNum !== null &&
      calculated === amountToChargeNum
        ? 'Yes'
        : 'No';

    for (let i = 0; i < approvedAmountColumns; i++) {
      const header = `${APPROVED_AMOUNT_HEADER_PREFIX} ${i + 1}`;
      if (i < approved.length) {
        row[header] = formatApprovedAmountCell(approved[i]);
      } else {
        row[header] = '';
      }
    }
  }
  return row;
}

/**
 * Builds all CSV rows for the provided jobs (each with its `jobItem[]`,
 * `property`, `batch`, and `portfolio` relations loaded), along with the
 * effective header list for this export.
 *
 * In practice this function is always called with a single-job array
 * (each per-job CSV is built independently in the bulk export path), so
 * the resulting CSV always represents one OTA. Headers are tailored to
 * the OTA:
 *   - Expedia → static columns + Card Activity + Calculated Amount to
 *     Charge + Amount Match + N "Card Activity Approved Amount K" columns
 *     (N = max approved authorizations on any Expedia job item passed in).
 *   - Booking / Agoda → static columns only (no Expedia-specific columns).
 */
export function buildMasterRows(jobs: any[]): {
  headers: string[];
  rows: Record<string, string | number>[];
} {
  const isExpediaCsv = (jobs || []).some(
    (j: any) => j?.ota_provider === OTAProvider.Expedia,
  );

  let maxApprovedCount = 0;
  if (isExpediaCsv) {
    for (const job of jobs || []) {
      if (job?.ota_provider !== OTAProvider.Expedia) continue;
      const items = Array.isArray(job?.jobItem) ? job.jobItem : [];
      for (const item of items) {
        const count = getApprovedAuthorizations(item).length;
        if (count > maxApprovedCount) maxApprovedCount = count;
      }
    }
  }

  const headers: string[] = [
    ...MASTER_EXPORT_HEADER,
    ...(isExpediaCsv
      ? [
          CARD_ACTIVITY_HEADER,
          CALCULATED_AMOUNT_HEADER,
          AMOUNT_MATCH_HEADER,
          ...Array.from(
            { length: maxApprovedCount },
            (_, i) => `${APPROVED_AMOUNT_HEADER_PREFIX} ${i + 1}`,
          ),
        ]
      : []),
  ];

  const rows: Record<string, string | number>[] = [];
  for (const job of jobs || []) {
    const items = Array.isArray(job?.jobItem) ? job.jobItem : [];
    if (items.length === 0) continue;
    for (const item of items) {
      rows.push(buildMasterRow(job, item, maxApprovedCount));
    }
  }
  return { headers, rows };
}
