import { OTAProvider } from '@prisma/client';
import * as XLSX from 'xlsx';
import { applyExcelTextColumnFormat } from '../../common/utils/excel-text-column.util';

/**
 * Dashboard export (POST /reports/export-dashboard) — Excel layout.
 *
 * This is a SEPARATE column spec from `MASTER_EXPORT_HEADER` (which powers
 * `/jobs/export-master` and `/reports/export-master` /
 * `/reports/export-consolidated`). The dashboard export is the simplified
 * shape the Reports → "Download for Dashboard" action emits.
 *
 * Header strings are written EXACTLY as the downstream spreadsheet
 * template expects them, including the trailing `*` on required columns
 * (`OTA*`, `Hotel ID*`, `Portfolio*`, `Hotel Name*`, `Reservation ID*`,
 * `Status*`, `Currency*`, `Amount Collected*`, `Due To Property*`,
 * `Due To VNP*`). DO NOT strip or rename them.
 *
 * Order is also significant: changing it breaks the downstream template.
 * Add new columns at the END unless the consumer explicitly asks for
 * them somewhere in the middle.
 */
export const DASHBOARD_EXPORT_HEADER: string[] = [
  'OTA*',
  'Hotel ID*',
  'Batch',
  'Review/Collection Date',
  'Portfolio*',
  'Hotel Name*',
  'Reservation ID*',
  'Status*',
  'Name',
  'Check In',
  'Check Out',
  'Currency*',
  'Amount Collected*',
  'Due To Property*',
  'Due To VNP*',
];

const NA = 'N/A';

/** Round to 4 decimal places. Used for the Due To Property / VNP splits. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Returns the OTA-specific property ID (Expedia / Booking / Agoda) for
 * the job's OTA provider. Mirrors the helper used by the master export
 * so Hotel ID stays consistent across both reports.
 */
function getHotelIdForJob(job: any): string | number {
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
 * Formats a date-like input as "MMM dd, yyyy" (e.g. "Feb 28, 2026").
 * Falls back to the original string when it can't be parsed.
 */
function formatDisplayDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) {
    return typeof value === 'string' ? value : '';
  }
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

/**
 * Builds one dashboard row for a given (job, jobItem) pair. Keys exactly
 * match `DASHBOARD_EXPORT_HEADER` so `XLSX.utils.json_to_sheet(..., { header })`
 * emits the columns in the right order.
 */
export function buildDashboardRow(
  job: any,
  item: any,
): Record<string, string | number> {
  const ota = job?.ota_provider as OTAProvider | undefined;
  const isExpedia = ota === OTAProvider.Expedia;
  const isBooking = ota === OTAProvider.Booking;

  const amountToCharge: number | null =
    typeof item?.payment_info?.amount_to_charge_or_refund === 'number'
      ? item.payment_info.amount_to_charge_or_refund
      : null;

  // Due To Property / Due To VNP are an 85 / 15 split of the amount the
  // OTA expects us to charge — but only for Expedia / Booking jobs.
  // Agoda (and any other OTA) leaves both cells as "N/A", as does any
  // row where amount_to_charge_or_refund couldn't be resolved.
  const splitEligible = (isExpedia || isBooking) && amountToCharge !== null;
  const dueToProperty = splitEligible
    ? round4((amountToCharge as number) * 0.85)
    : NA;
  const dueToVnp = splitEligible
    ? round4((amountToCharge as number) * 0.15)
    : NA;

  const row: Record<string, string | number> = {};
  row[DASHBOARD_EXPORT_HEADER[0]] = ota ?? ''; // OTA
  row[DASHBOARD_EXPORT_HEADER[1]] = getHotelIdForJob(job) || ''; // Hotel ID
  // Batch: prefer the related batch.name, fall back to denormalized batch_name.
  row[DASHBOARD_EXPORT_HEADER[2]] =
    job?.batch?.name ?? job?.batch_name ?? ''; // Batch
  row[DASHBOARD_EXPORT_HEADER[3]] = formatDisplayDate(job?.end_date); // Review/Collection Date
  row[DASHBOARD_EXPORT_HEADER[4]] =
    job?.portfolio_name ?? job?.portfolio?.name ?? ''; // Portfolio
  row[DASHBOARD_EXPORT_HEADER[5]] = job?.property_name ?? ''; // Hotel Name
  row[DASHBOARD_EXPORT_HEADER[6]] = item?.reservation_id ?? ''; // Reservation ID
  // `Status*` is hard-coded to the literal string "TBD" per the spec —
  // the source-of-truth field hasn't been finalized yet, so every row
  // emits the same placeholder value. Update this once the real source
  // (e.g. job.job_status or a per-item flag) is decided.
  row[DASHBOARD_EXPORT_HEADER[7]] = 'TBD'; // Status*
  row[DASHBOARD_EXPORT_HEADER[8]] = item?.guest_name ?? ''; // Name
  row[DASHBOARD_EXPORT_HEADER[9]] = formatDisplayDate(item?.check_in_date); // Check In
  row[DASHBOARD_EXPORT_HEADER[10]] = formatDisplayDate(item?.check_out_date); // Check Out
  row[DASHBOARD_EXPORT_HEADER[11]] =
    item?.payment_info?.amount_to_charge_or_refund_currency || 'USD'; // Currency
  row[DASHBOARD_EXPORT_HEADER[12]] =
    amountToCharge !== null ? amountToCharge : ''; // Amount Collected
  row[DASHBOARD_EXPORT_HEADER[13]] = dueToProperty; // Due To Property
  row[DASHBOARD_EXPORT_HEADER[14]] = dueToVnp; // Due To VNP

  return row;
}

/**
 * Builds every dashboard row for the supplied jobs (each expected to have
 * its `jobItem[]`, `property`, `batch`, and `portfolio` relations loaded).
 * Jobs with zero items are silently skipped (matches the master-export
 * behaviour).
 */
export function buildDashboardRows(jobs: any[]): {
  headers: string[];
  rows: Record<string, string | number>[];
} {
  const headers = [...DASHBOARD_EXPORT_HEADER];
  const rows: Record<string, string | number>[] = [];
  for (const job of jobs || []) {
    const items = Array.isArray(job?.jobItem) ? job.jobItem : [];
    if (items.length === 0) continue;
    for (const item of items) {
      rows.push(buildDashboardRow(job, item));
    }
  }
  return { headers, rows };
}

/**
 * Render the dashboard rows for the provided jobs into a single XLSX
 * workbook (one "Dashboard" sheet). Returns a Buffer ready to stream
 * back to the client.
 */
export function buildDashboardXlsxBuffer(jobs: any[]): Buffer {
  const { headers, rows } = buildDashboardRows(jobs);

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  // `Hotel ID*` can be a long numeric OTA ID (Expedia, Booking, Agoda).
  // Forcing it to Text avoids Excel auto-converting it to scientific
  // notation. NOTE: the header label here MUST match `DASHBOARD_EXPORT_HEADER`
  // exactly — trailing `*` included.
  applyExcelTextColumnFormat(worksheet, rows, 'Hotel ID*');

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Dashboard');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
