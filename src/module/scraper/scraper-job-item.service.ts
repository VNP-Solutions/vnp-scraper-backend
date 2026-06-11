import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JobItem, OTAProvider } from '@prisma/client';
import * as XLSX from 'xlsx';
import {
  computeDerivedJobItemFields,
  isDerivedFresh,
} from '../job/job-item-derived.util';
import { DatabaseService } from '../database/database.service';
import {
  DerivedFieldsUpdate,
  IScraperJobItemRepository,
  IScraperJobItemService,
  JobItemUploadResult,
  JobItemUploadRow,
} from './scraper-job-item.interface';

/**
 * Type of a JobItem row after the repo `include: { job: true }` step.
 * We need the joined Job to read `ota_provider`, and we re-declare the
 * three derived columns so this file compiles even before the editor
 * re-reads regenerated Prisma types (the schema fields are nullable).
 */
type JobItemWithJob = JobItem & {
  job?: { ota_provider?: OTAProvider } | null;
  over_160?: boolean | null;
  days_since_checkout?: number | null;
  derived_calculated_at?: Date | null;
};

/** Column headers as they appear in the upload sheet. */
const COL = {
  OTA: 'OTA',
  OTA_ID: 'OTA ID',
  RESERVATION_ID: 'Reservation ID',
  CONFIRMATION_NUMBER: 'Hotel Confirmation Code (Expedia)',
  GUEST_NAME: 'Guest name',
  CHECK_IN: 'Check In (MM/DD/YYYY) (Expedia, Agoda)',
  CHECK_OUT: 'Check Out (MM/DD/YYYY) (Expedia, Agoda)',
  CHARGE_BEFORE: 'Charge Before (Booking)',
  CURRENCY: 'Currency',
  BOOKING_AMOUNT: 'Booking Amount (Expedia)',
  AMOUNT_TO_CHARGE: 'Amount to Charge',
  CARD_STATUS: 'Card Status (Expedia)',
  CARD_NUMBER: 'Card Number',
  EXPIRY_DATE: 'Expiry date',
  CVV: 'CVV',
} as const;

/** Fields that must carry a non-empty value for each OTA. */
const OTA_REQUIRED_FIELDS: Record<OTAProvider, string[]> = {
  [OTAProvider.Expedia]: [
    COL.RESERVATION_ID,
    COL.CONFIRMATION_NUMBER,
    COL.GUEST_NAME,
    COL.CHECK_IN,
    COL.CHECK_OUT,
    COL.BOOKING_AMOUNT,
    COL.CARD_NUMBER,
    COL.EXPIRY_DATE,
  ],
  [OTAProvider.Agoda]: [
    COL.RESERVATION_ID,
    COL.GUEST_NAME,
    COL.CHECK_IN,
    COL.CHECK_OUT,
    COL.CARD_NUMBER,
    COL.EXPIRY_DATE,
  ],
  [OTAProvider.Booking]: [
    COL.RESERVATION_ID,
    COL.GUEST_NAME,
    COL.CHARGE_BEFORE,
    COL.AMOUNT_TO_CHARGE,
    COL.CARD_NUMBER,
    COL.EXPIRY_DATE,
  ],
};

/** All column headers that must be present in the uploaded file. */
const REQUIRED_HEADERS = [
  COL.OTA,
  COL.OTA_ID,
  COL.RESERVATION_ID,
  COL.CONFIRMATION_NUMBER,
  COL.GUEST_NAME,       // "Guest name"
  COL.CHECK_IN,
  COL.CHECK_OUT,
  COL.CHARGE_BEFORE,
  COL.CURRENCY,
  COL.BOOKING_AMOUNT,
  COL.AMOUNT_TO_CHARGE,
  COL.CARD_STATUS,
  COL.CARD_NUMBER,
  COL.EXPIRY_DATE,
  COL.CVV,
];

const MM_DD_YYYY = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * Parses a strictly MM/DD/YYYY string into a UTC Date.
 * Returns `null` when the value is absent or does not match the pattern.
 */
function parseDateStrict(value: string | undefined): Date | null {
  if (!value) return null;
  const match = value.trim().match(MM_DD_YYYY);
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  // Verify the calendar rolled over (e.g. month 13 or day 32)
  if (
    d.getUTCFullYear() !== Number(yyyy) ||
    d.getUTCMonth() !== Number(mm) - 1 ||
    d.getUTCDate() !== Number(dd)
  ) {
    return null;
  }
  return d;
}

/**
 * Returns true when the value is absent/empty (skip date validation for
 * OTAs where Check In/Out are not required).
 */
function isValidDateFormat(value: string | undefined): boolean {
  if (!value?.trim()) return true; // empty — let the required-field check handle it
  return MM_DD_YYYY.test(value.trim()) && parseDateStrict(value) !== null;
}

function mapRowToJobItemData(
  row: Record<string, string>,
  jobId: string,
  propertyId: string,
): JobItemUploadRow {
  const checkIn = parseDateStrict(row[COL.CHECK_IN]) ?? new Date();
  const checkOut = parseDateStrict(row[COL.CHECK_OUT]) ?? new Date();

  const cardNumber = row[COL.CARD_NUMBER]?.toString().trim() || '';
  const expiryDate = row[COL.EXPIRY_DATE]?.toString().trim() || '';
  const cvv = row[COL.CVV]?.toString().trim() || undefined;
  const reasonForCharge = row[COL.CARD_STATUS]?.toString().trim() || undefined;

  const hasCardInfo = !!(cardNumber || expiryDate);
  const cardInfo = hasCardInfo
    ? { card_number: cardNumber, expiry_date: expiryDate, cvv, reason_for_charge: reasonForCharge }
    : undefined;

  const rawAmount = row[COL.AMOUNT_TO_CHARGE]?.toString().trim();
  const amountToCharge = rawAmount ? parseFloat(rawAmount) : 0;
  const rawPayout = row[COL.BOOKING_AMOUNT]?.toString().trim();
  const totalPayout = rawPayout ? parseFloat(rawPayout) : undefined;
  const currency = row[COL.CURRENCY]?.toString().trim() || undefined;
  const chargeBefore = row[COL.CHARGE_BEFORE]?.toString().trim() || undefined;

  const hasPaymentInfo = !!(amountToCharge || totalPayout || currency || chargeBefore);
  const paymentInfo = hasPaymentInfo
    ? {
        amount_to_charge_or_refund: amountToCharge,
        total_payout: totalPayout,
        amount_to_charge_or_refund_currency: currency,
        charge_before: chargeBefore,
      }
    : undefined;

  const reservationId = row[COL.RESERVATION_ID]?.toString().trim() || null;
  const confirmationNumber = row[COL.CONFIRMATION_NUMBER]?.toString().trim() || null;
  const guestName = row[COL.GUEST_NAME]?.toString().trim() || '';

  return {
    job_id: jobId,
    property_id: propertyId,
    guest_name: guestName,
    reservation_id: reservationId,
    confirmation_number: confirmationNumber,
    check_in_date: checkIn,
    check_out_date: checkOut,
    room_type: '',
    booked_date: checkIn,
    has_card_info: hasCardInfo,
    card_info: cardInfo,
    has_payment_info: hasPaymentInfo,
    payment_info: paymentInfo,
    reservation_status: 'Active',
  };
}

@Injectable()
export class ScraperJobItemService implements IScraperJobItemService {
  constructor(
    @Inject('IScraperJobItemRepository')
    private readonly jobItemRepository: IScraperJobItemRepository,
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  /**
   * Decorates a batch of JobItem rows with up-to-date `over_160` and
   * `days_since_checkout`. Implements the Mongo-backed lazy cache
   * described in job-item-derived.util.ts:
   *
   *   - Booking/Agoda rows: short-circuit. We never compute or store
   *     these values for non-Expedia OTAs; the API just returns null.
   *   - Expedia rows with `derived_calculated_at >= startOfDay(today)`:
   *     fresh — return cached values from the document.
   *   - Expedia rows with a stale/missing `derived_calculated_at`:
   *     recompute from `check_out_date` and queue a write so the next
   *     read of the same row hits the fast path.
   *
   * The write happens in the background as a single batched call so
   * the user's request returns immediately. The in-memory `decorated`
   * array always reflects today's values, regardless of whether the
   * persist step succeeded.
   */
  private async decorateWithDerivedFields<T extends JobItemWithJob>(
    items: T[],
  ): Promise<T[]> {
    if (!items || items.length === 0) return items;

    const today = new Date();
    const decorated: T[] = [];
    const pendingUpdates: DerivedFieldsUpdate[] = [];

    for (const item of items) {
      // Non-Expedia rows are intentionally untouched. The schema fields
      // stay null and the API surfaces them as null too. This matches
      // the CSV master export which shows "N/A" for these OTAs.
      if (item?.job?.ota_provider !== OTAProvider.Expedia) {
        decorated.push(item);
        continue;
      }

      // Fresh: cached values are still valid for "today". Hand them
      // back without touching the DB.
      if (isDerivedFresh(item.derived_calculated_at, today)) {
        decorated.push(item);
        continue;
      }

      // Stale (or never computed): recompute from check_out_date and
      // mutate the in-memory copy so this request returns the up-to-date
      // value. Queue the write to persist for subsequent requests.
      const derived = computeDerivedJobItemFields(item.check_out_date, today);
      const refreshed: T = {
        ...item,
        over_160: derived.over_160,
        days_since_checkout: derived.days_since_checkout,
        derived_calculated_at: today,
      };
      decorated.push(refreshed);
      pendingUpdates.push({
        id: item.id,
        over_160: derived.over_160,
        days_since_checkout: derived.days_since_checkout,
        derived_calculated_at: today,
      });
    }

    // Fire-and-forget the batched write. We deliberately don't await
    // here: the read response is already correct (we built `decorated`
    // off the freshly computed values), and the persist step is just a
    // performance optimization for the *next* read. Errors are logged
    // inside the repo and never propagate back to the caller.
    if (pendingUpdates.length > 0) {
      this.jobItemRepository
        .bulkRefreshDerivedFields(pendingUpdates)
        .catch((err) => {
          this.logger.warn(
            `Background refresh of derived fields failed (${pendingUpdates.length} rows): ${
              (err as Error)?.message ?? err
            }`,
          );
        });
    }

    return decorated;
  }

  async getAllJobItemsByJobId(jobId: string): Promise<JobItem[]> {
    try {
      const jobItems = await this.jobItemRepository.findAllByJobId(jobId);
      return await this.decorateWithDerivedFields(
        jobItems as JobItemWithJob[],
      );
    } catch (error) {
      this.logger.error(
        `Error getting job items for job ${jobId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getJobItemsByJobIdWithPagination(
    jobId: string,
    query?: Record<string, any>,
  ): Promise<{ data: JobItem[]; metadata: any }> {
    try {
      const result = await this.jobItemRepository.findAllByJobIdWithPagination(
        jobId,
        query,
      );
      const decorated = await this.decorateWithDerivedFields(
        result.data as JobItemWithJob[],
      );
      return { ...result, data: decorated };
    } catch (error) {
      this.logger.error(
        `Error getting job items for job ${jobId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateJobCurrentUrl(jobId: string, currentUrl: string): Promise<void> {
    try {
      await this.jobItemRepository.updateJobCurrentUrl(jobId, currentUrl);
      this.logger.log(`Successfully updated current_url for job ${jobId}`);
    } catch (error) {
      this.logger.error(
        `Error updating current_url for job ${jobId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async uploadJobItemsFromFile(
    jobId: string,
    propertyId: string,
    file: Express.Multer.File,
  ): Promise<JobItemUploadResult> {
    // ── 1. Parse file ─────────────────────────────────────────────────────────
    if (!file?.buffer) {
      throw new BadRequestException('File buffer is empty');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Read as a 2-D array with raw: true so numbers stay as JS numbers
    // (avoids scientific-notation / comma-formatted strings from raw:false)
    // then normalize header names and convert every value to a plain string.
    const rawMatrix = XLSX.utils.sheet_to_json<any[]>(worksheet, {
      header: 1,
      raw: true,
      defval: '',
    });

    if (!rawMatrix || rawMatrix.length < 2) {
      throw new BadRequestException('The uploaded file is empty or contains no data rows');
    }

    const headers: string[] = (rawMatrix[0] as any[]).map((h) =>
      h !== undefined && h !== null ? String(h).trim() : '',
    );

    const rows: Record<string, string>[] = (rawMatrix.slice(1) as any[][]).map(
      (rowArr) => {
        const obj: Record<string, string> = {};
        headers.forEach((header, idx) => {
          if (header) {
            const cell = rowArr[idx];
            obj[header] =
              cell !== undefined && cell !== null ? String(cell).trim() : '';
          }
        });
        return obj;
      },
    );

    // ── 2. Check required column headers ─────────────────────────────────────
    const presentHeaders = new Set(headers.filter(Boolean));
    const missingHeaders = REQUIRED_HEADERS.filter((h) => !presentHeaders.has(h));
    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `Missing required column(s): ${missingHeaders.join(', ')}`,
      );
    }

    // ── 3. Load job + property ────────────────────────────────────────────────
    const job = await this.db.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException(`Job with id '${jobId}' not found`);
    }

    const property = await this.db.property.findUnique({ where: { id: propertyId } });
    if (!property) {
      throw new NotFoundException(`Property with id '${propertyId}' not found`);
    }

    const jobOta = job.ota_provider; // e.g. OTAProvider.Expedia

    const propertyOtaIdMap: Record<OTAProvider, number | null> = {
      [OTAProvider.Expedia]: property.expedia_id ?? null,
      [OTAProvider.Agoda]: property.agoda_id ?? null,
      [OTAProvider.Booking]: property.booking_id ?? null,
    };
    const expectedOtaId = propertyOtaIdMap[jobOta];

    // ── 4. Validate every row ─────────────────────────────────────────────────
    const errors: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // row 1 = header, data starts at row 2

      const rowOta = row[COL.OTA]?.toString().trim();
      const rowOtaId = row[COL.OTA_ID]?.toString().trim();

      // OTA value must match the job's OTA provider
      if (rowOta !== jobOta) {
        errors.push({
          row: rowNum,
          message: `OTA value '${rowOta}' does not match job OTA provider '${jobOta}'`,
        });
      }

      // OTA ID must match the property's corresponding OTA ID
      if (expectedOtaId === null || expectedOtaId === undefined) {
        errors.push({
          row: rowNum,
          message: `Property does not have a ${jobOta} ID configured`,
        });
      } else if (rowOtaId !== String(expectedOtaId)) {
        errors.push({
          row: rowNum,
          message: `OTA ID '${rowOtaId}' does not match property ${jobOta} ID '${expectedOtaId}'`,
        });
      }

      // Required fields per OTA must have non-empty values
      const requiredFields = OTA_REQUIRED_FIELDS[jobOta] ?? [];
      for (const field of requiredFields) {
        if (!row[field]?.toString().trim()) {
          errors.push({
            row: rowNum,
            message: `Required field '${field}' is missing or empty for OTA '${jobOta}'`,
          });
        }
      }

      // Date format validation — only for OTAs that use Check In / Check Out
      if (jobOta === OTAProvider.Expedia || jobOta === OTAProvider.Agoda) {
        const checkInVal = row[COL.CHECK_IN]?.toString().trim();
        const checkOutVal = row[COL.CHECK_OUT]?.toString().trim();

        if (checkInVal && !isValidDateFormat(checkInVal)) {
          errors.push({
            row: rowNum,
            message: `'${COL.CHECK_IN}' value '${checkInVal}' is not in MM/DD/YYYY format`,
          });
        }
        if (checkOutVal && !isValidDateFormat(checkOutVal)) {
          errors.push({
            row: rowNum,
            message: `'${COL.CHECK_OUT}' value '${checkOutVal}' is not in MM/DD/YYYY format`,
          });
        }
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Validation failed', errors });
    }

    // ── 5. Persist rows ───────────────────────────────────────────────────────
    let created = 0;
    let updated = 0;
    const items: JobItem[] = [];

    for (const row of rows) {
      const jobItemData = mapRowToJobItemData(row, jobId, propertyId);
      try {
        const { item, wasCreated } = await this.jobItemRepository.upsertJobItem(jobItemData);
        items.push(item);
        if (wasCreated) {
          created++;
        } else {
          updated++;
        }
      } catch (err) {
        this.logger.error(
          `Failed to upsert job item for reservation '${jobItemData.reservation_id}': ${err.message}`,
          err.stack,
        );
        throw err;
      }
    }

    // ── 6. Mark job as Completed ──────────────────────────────────────────────
    await this.db.job.update({
      where: { id: jobId },
      data: { job_status: 'Completed' },
    });

    this.logger.log(
      `Job item upload complete for job ${jobId}: ${created} created, ${updated} updated. Job status set to Completed.`,
    );

    return { uploaded: items.length, created, updated, items };
  }
}
