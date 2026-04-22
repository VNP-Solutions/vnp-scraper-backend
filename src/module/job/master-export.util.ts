import { OTAProvider, PostingType } from '@prisma/client';

/**
 * Exact column order for the Master export CSV.
 * DO NOT re-order - the output spec depends on this order.
 */
export const MASTER_EXPORT_HEADER: string[] = [
  'OTA',
  'OTA Posting Type*',
  'OTA ID',
  'Batch',
  'Review Collection Date*',
  'Portfolio',
  'Property Name*',
  'Reservation ID*',
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
 * Rounds a number to 4 decimal places, matching the sample
 * (e.g. 114.852, 20.268, 798.4645, 140.9055).
 */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Builds one CSV row object for a given (job, jobItem) pair, applying the
 * OTA-specific rules described in the spec.
 *
 * Keys in the returned object must exactly match MASTER_EXPORT_HEADER so
 * XLSX's json_to_sheet(..., { header }) emits columns in the right order.
 */
export function buildMasterRow(
  job: any,
  item: any,
): Record<string, string | number> {
  const ota = job?.ota_provider as OTAProvider | undefined;
  const isExpedia = ota === OTAProvider.Expedia;
  const isBooking = ota === OTAProvider.Booking;

  const amountToCharge: number | null =
    item?.payment_info?.amount_to_charge_or_refund ?? null;

  const dueToProperty =
    (isExpedia || isBooking) && amountToCharge !== null
      ? round4(amountToCharge * 0.85)
      : NA;
  const dueToVnp =
    (isExpedia || isBooking) && amountToCharge !== null
      ? round4(amountToCharge * 0.15)
      : NA;

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
  row[MASTER_EXPORT_HEADER[10]] = formatDisplayDate(item?.check_in_date); // Check In
  row[MASTER_EXPORT_HEADER[11]] = formatDisplayDate(item?.check_out_date); // Check Out
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
  row[MASTER_EXPORT_HEADER[20]] = dueToProperty; // Due to Property
  row[MASTER_EXPORT_HEADER[21]] = dueToVnp; // Due to VNP/Invoice
  row[MASTER_EXPORT_HEADER[22]] = ''; // Processor
  row[MASTER_EXPORT_HEADER[23]] = ''; // QP Username
  row[MASTER_EXPORT_HEADER[24]] = ''; // Case Contact
  row[MASTER_EXPORT_HEADER[25]] = ''; // Reporting Contact
  return row;
}

/**
 * Builds all CSV rows for the provided jobs (each with its `jobItem[]`,
 * `property`, `batch`, and `portfolio` relations loaded).
 */
export function buildMasterRows(
  jobs: any[],
): Record<string, string | number>[] {
  const rows: Record<string, string | number>[] = [];
  for (const job of jobs || []) {
    const items = Array.isArray(job?.jobItem) ? job.jobItem : [];
    if (items.length === 0) continue;
    for (const item of items) {
      rows.push(buildMasterRow(job, item));
    }
  }
  return rows;
}
