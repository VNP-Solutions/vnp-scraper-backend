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
import { readOtaIdFromPropertyRecord } from '../job/ota-property-id.util';
import { buildReplyWaitFields } from '../job/reply-status.util';
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

/** Extra columns from the master export that help identify the target job. */
const JOB_MATCH_COL = {
  BATCH: 'Batch',
  REVIEW_COLLECTION_DATE: 'Review Collection Date',
  PROPERTY_NAME: 'Property Name',
} as const;

type JobResolveFailure = {
  readonly ok: false;
  message: string;
  logDetail: string;
};
type JobResolveSuccess = { readonly ok: true; job: any; property: any };
type JobResolveResult = JobResolveFailure | JobResolveSuccess;

/**
 * Maps canonical import headers to the set of aliases that may appear in
 * uploaded sheets (short export names and the parenthetical template names).
 * Any header not listed here is ignored.
 */
const HEADER_ALIASES: Record<string, string[]> = {
  [COL.OTA]: ['OTA'],
  [COL.OTA_ID]: ['OTA ID'],
  [COL.RESERVATION_ID]: ['Reservation ID'],
  [COL.CONFIRMATION_NUMBER]: [
    'Hotel Confirmation Code',
    'Hotel Confirmation Code (Expedia)',
  ],
  [COL.GUEST_NAME]: ['Guest name'],
  [COL.CHECK_IN]: ['Check In', 'Check In (MM/DD/YYYY) (Expedia, Agoda)'],
  [COL.CHECK_OUT]: ['Check Out', 'Check Out (MM/DD/YYYY) (Expedia, Agoda)'],
  [COL.CHARGE_BEFORE]: ['Charge Before', 'Charge Before (Booking)'],
  [COL.CURRENCY]: ['Currency'],
  [COL.BOOKING_AMOUNT]: ['Booking Amount', 'Booking Amount (Expedia)'],
  [COL.AMOUNT_TO_CHARGE]: ['Amount to Charge'],
  [COL.CARD_STATUS]: ['Card Status', 'Card Status (Expedia)'],
  [COL.CARD_NUMBER]: ['Card Number'],
  [COL.EXPIRY_DATE]: ['Expiry date'],
  [COL.CVV]: ['CVV'],
  [JOB_MATCH_COL.BATCH]: ['Batch'],
  [JOB_MATCH_COL.REVIEW_COLLECTION_DATE]: ['Review Collection Date'],
  [JOB_MATCH_COL.PROPERTY_NAME]: ['Property Name'],
};

/** Fields that must carry a non-empty value for each OTA. */
const OTA_REQUIRED_FIELDS: Record<OTAProvider, string[]> = {
  [OTAProvider.Expedia]: [
    COL.RESERVATION_ID,
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
  COL.GUEST_NAME,
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

/** Parses a strictly MM/DD/YYYY string into a UTC Date. */
function parseDateStrict(value: string | undefined): Date | null {
  if (!value) return null;
  const match = value.trim().match(MM_DD_YYYY);
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
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
 * Parses a display date like "Feb 28, 2026" (used by the master export for
 * Review Collection Date) back into a Date at UTC midnight.
 */
function parseDisplayDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** Normalizes import/export date strings to MM/DD/YYYY for job.end_date matching. */
function normalizeToMmDdYyyy(value: string | undefined): string | null {
  if (!value?.trim()) return null;

  const strict = parseDateStrict(value);
  const date = strict ?? parseDisplayDate(value);
  if (!date) return null;

  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/** Returns true when the value is absent/empty or a supported import date. */
function isValidDateFormat(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  const trimmed = value.trim();
  if (MM_DD_YYYY.test(trimmed) && parseDateStrict(trimmed) !== null) {
    return true;
  }
  return parseDisplayDate(trimmed) !== null;
}

/** Parses Check In/Out from MM/DD/YYYY or legacy export display dates. */
function parseImportDate(value: string | undefined): Date | null {
  return parseDateStrict(value) ?? parseDisplayDate(value);
}

/** Converts a raw header to its canonical form, or null if unknown. */
function normalizeHeader(raw: string): string | null {
  const trimmed = raw.trim();
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(trimmed) || canonical === trimmed) return canonical;
  }
  return null;
}

function mapRowToJobItemData(
  row: Record<string, string>,
  jobId: string,
  propertyId: string,
): JobItemUploadRow {
  const checkIn = parseImportDate(row[COL.CHECK_IN]) ?? new Date();
  const checkOut = parseImportDate(row[COL.CHECK_OUT]) ?? new Date();

  const cardNumber = row[COL.CARD_NUMBER]?.toString().trim() || '';
  const expiryDate = row[COL.EXPIRY_DATE]?.toString().trim() || '';
  const cvv = row[COL.CVV]?.toString().trim() || undefined;
  const reasonForCharge = row[COL.CARD_STATUS]?.toString().trim() || undefined;

  const hasCardInfo = !!(cardNumber || expiryDate);
  const cardInfo = hasCardInfo
    ? {
        card_number: cardNumber,
        expiry_date: expiryDate,
        cvv,
        reason_for_charge: reasonForCharge,
      }
    : undefined;

  const rawAmount = row[COL.AMOUNT_TO_CHARGE]?.toString().trim();
  const amountToCharge = rawAmount ? parseFloat(rawAmount) : 0;
  const rawPayout = row[COL.BOOKING_AMOUNT]?.toString().trim();
  const totalPayout = rawPayout ? parseFloat(rawPayout) : undefined;
  const currency = row[COL.CURRENCY]?.toString().trim() || undefined;
  const chargeBefore = row[COL.CHARGE_BEFORE]?.toString().trim() || undefined;

  const hasPaymentInfo = !!(
    amountToCharge ||
    totalPayout ||
    currency ||
    chargeBefore
  );
  const paymentInfo = hasPaymentInfo
    ? {
        amount_to_charge_or_refund: amountToCharge,
        total_payout: totalPayout,
        amount_to_charge_or_refund_currency: currency,
        charge_before: chargeBefore,
      }
    : undefined;

  const reservationId = row[COL.RESERVATION_ID]?.toString().trim() || null;
  const confirmationNumber =
    row[COL.CONFIRMATION_NUMBER]?.toString().trim() || null;
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
   * `days_since_checkout`.
   */
  private async decorateWithDerivedFields<T extends JobItemWithJob>(
    items: T[],
  ): Promise<T[]> {
    if (!items || items.length === 0) return items;

    const today = new Date();
    const decorated: T[] = [];
    const pendingUpdates: DerivedFieldsUpdate[] = [];

    for (const item of items) {
      if (item?.job?.ota_provider !== OTAProvider.Expedia) {
        decorated.push(item);
        continue;
      }

      if (isDerivedFresh(item.derived_calculated_at, today)) {
        decorated.push(item);
        continue;
      }

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
      return await this.decorateWithDerivedFields(jobItems as JobItemWithJob[]);
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
    const fileLabel = file.originalname ?? 'upload';
    this.logger.log(
      `Starting single job-items import — file="${fileLabel}", ` +
        `size=${file.size ?? file.buffer?.length ?? 0} bytes, ` +
        `job_id=${jobId}, property_id=${propertyId}`,
    );

    let rows: Record<string, string>[];
    try {
      const parseResult = this.parseImportFile(file);
      rows = parseResult.rows;
    } catch (err: any) {
      this.logger.error(
        `Single job-items import failed while parsing "${fileLabel}": ${err.message}`,
        err.stack,
      );
      throw err;
    }

    this.logParsedImportFileSummary(fileLabel, rows);

    const job = await this.db.job.findUnique({ where: { id: jobId } });
    if (!job) {
      this.logger.error(
        `Single job-items import: job with id '${jobId}' not found`,
      );
      throw new NotFoundException(`Job with id '${jobId}' not found`);
    }

    this.logger.log(
      `Target job ${job.id} — OTA=${job.ota_provider}, ` +
        `end_date=${job.end_date ?? ''}, property_name="${job.property_name}", ` +
        `job.property_id=${job.property_id ?? '(none)'}`,
    );

    const property = await this.resolvePropertyFromImportRows(
      rows,
      job.ota_provider,
      propertyId,
    );

    this.logger.log(
      `Resolved property ${property.id} ("${property.name}") — ` +
        `expedia_id=${property.expedia_id ?? '(none)'}, ` +
        `booking_id=${property.booking_id ?? '(none)'}, ` +
        `agoda_id=${property.agoda_id ?? '(none)'}`,
    );

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const row = rows[i];
      this.logger.log(
        `Row ${rowNum}: validating — OTA=${row[COL.OTA] ?? ''}, ` +
          `OTA ID=${row[COL.OTA_ID] ?? ''}, ` +
          `Reservation ID=${row[COL.RESERVATION_ID] ?? ''}, ` +
          `Guest=${row[COL.GUEST_NAME] ?? ''}`,
      );
    }

    const errors = this.validateRowsForJob(rows, job.ota_provider, property);
    if (errors.length > 0) {
      for (const err of errors) {
        this.logger.warn(`Row ${err.row}: validation failed — ${err.message}`);
      }
      this.logger.warn(
        `Single job-items import validation failed — file="${fileLabel}", ` +
          `job_id=${jobId}, errors=${errors.length}`,
      );
      throw new BadRequestException({ message: 'Validation failed', errors });
    }

    this.logger.log(
      `Processing job ${jobId} — ${rows.length} row(s), property ${property.id}`,
    );

    try {
      const result = await this.persistRows(
        rows,
        jobId,
        property.id,
        job.ota_provider,
      );
      this.logger.log(
        `Single job-items import finished — file="${fileLabel}", job_id=${jobId}, ` +
          `status=success, totalRows=${rows.length}, created=${result.created}, ` +
          `updated=${result.updated}`,
      );
      return result;
    } catch (err: any) {
      this.logger.error(
        `Single job-items import failed during persistence — file="${fileLabel}", ` +
          `job_id=${jobId}: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }

  /**
   * Bulk import entry point. Parses one file containing rows for multiple
   * jobs, groups the rows by resolved job, validates each group, and upserts
   * the job items. Returns a report summary (used by the async consumer to
   * send the completion email).
   */
  async bulkUploadJobItemsFromFile(file: Express.Multer.File): Promise<{
    status: 'success' | 'partial' | 'failed';
    totalRows: number;
    processedJobs: number;
    created: number;
    updated: number;
    errors: Array<{ row: number; message: string }>;
  }> {
    const fileLabel = file.originalname ?? 'upload';
    this.logger.log(
      `Starting bulk job-items import — file="${fileLabel}", size=${file.size ?? file.buffer?.length ?? 0} bytes`,
    );

    const parseResult = this.parseImportFile(file);
    const rows = parseResult.rows;
    this.logParsedImportFileSummary(fileLabel, rows);

    const allErrors: Array<{ row: number; message: string }> = [];
    const groups = new Map<
      string,
      {
        job: any;
        property: any;
        rows: Array<{ row: Record<string, string>; rowNum: number }>;
      }
    >();

    // Resolve each row to a job and build groups.
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const row = rows[i];

      const ota = row[COL.OTA]?.trim();
      if (!ota || !Object.values(OTAProvider).includes(ota as OTAProvider)) {
        this.logger.warn(
          `Row ${rowNum}: invalid or missing OTA '${ota ?? ''}'`,
        );
        allErrors.push({
          row: rowNum,
          message: `Invalid or missing OTA value '${ota}'`,
        });
        continue;
      }

      this.logger.log(
        `Row ${rowNum}: resolving job — OTA=${ota}, OTA ID=${row[COL.OTA_ID] ?? ''}, ` +
          `Batch=${row[JOB_MATCH_COL.BATCH] ?? ''}, Review Collection Date=${row[JOB_MATCH_COL.REVIEW_COLLECTION_DATE] ?? ''}, ` +
          `Property=${row[JOB_MATCH_COL.PROPERTY_NAME] ?? ''}`,
      );

      const resolution = await this.resolveJobFromRow(row, ota as OTAProvider);
      if (resolution.ok === false) {
        this.logger.warn(
          `Row ${rowNum}: job resolution failed — ${resolution.logDetail}`,
        );
        allErrors.push({
          row: rowNum,
          message: `${resolution.message} (${resolution.logDetail})`,
        });
        continue;
      }

      this.logger.log(
        `Row ${rowNum}: resolved job ${resolution.job.id} (property ${resolution.property.id})`,
      );

      const groupKey = `${resolution.job.id}:${resolution.property.id}`;
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          job: resolution.job,
          property: resolution.property,
          rows: [],
        };
        groups.set(groupKey, group);
      }
      group.rows.push({ row, rowNum });
    }

    let created = 0;
    let updated = 0;
    let processedJobs = 0;

    this.logger.log(
      `Grouped ${rows.length} row(s) into ${groups.size} job group(s) for persistence`,
    );

    for (const group of groups.values()) {
      this.logger.log(
        `Processing job ${group.job.id} — ${group.rows.length} row(s), property ${group.property.id}`,
      );

      const groupRows = group.rows.map((r) => r.row);
      const groupErrors = this.validateRowsForJob(
        groupRows,
        group.job.ota_provider,
        group.property,
      );

      // Report each validation error with the original row number.
      const rowNumMap = new Map(
        groupRows.map((r, idx) => [r, group.rows[idx].rowNum]),
      );
      for (const err of groupErrors) {
        const originalRowNum = rowNumMap.get(groupRows[err.row - 2]) ?? err.row;
        this.logger.warn(
          `Row ${originalRowNum}: validation failed — ${err.message}`,
        );
        allErrors.push({ row: originalRowNum, message: err.message });
      }

      // Skip the whole group if it has validation errors.
      if (groupErrors.length > 0) {
        this.logger.warn(
          `Job ${group.job.id}: skipped — ${groupErrors.length} validation error(s)`,
        );
        continue;
      }

      try {
        const result = await this.persistRows(
          groupRows,
          group.job.id,
          group.property.id,
          group.job.ota_provider,
        );
        created += result.created;
        updated += result.updated;
        processedJobs += 1;
        this.logger.log(
          `Job ${group.job.id}: persisted — ${result.created} created, ${result.updated} updated`,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to persist job items for job ${group.job.id}: ${err.message}`,
          err.stack,
        );
        for (const { rowNum } of group.rows) {
          allErrors.push({
            row: rowNum,
            message: `Failed to save job items: ${err.message}`,
          });
        }
      }
    }

    const status: 'success' | 'partial' | 'failed' =
      allErrors.length === 0
        ? 'success'
        : processedJobs > 0
          ? 'partial'
          : 'failed';

    this.logger.log(
      `Bulk job-items import finished — file="${fileLabel}", status=${status}, ` +
        `totalRows=${rows.length}, processedJobs=${processedJobs}, created=${created}, ` +
        `updated=${updated}, errors=${allErrors.length}`,
    );

    return {
      status,
      totalRows: rows.length,
      processedJobs,
      created,
      updated,
      errors: allErrors,
    };
  }

  /**
   * Parses a CSV / XLSX / XLS file into normalized rows. Unknown headers
   * are ignored. Required columns must be present (using canonical names).
   */
  private parseImportFile(file: Express.Multer.File): {
    rows: Record<string, string>[];
  } {
    if (!file?.buffer) {
      throw new BadRequestException('File buffer is empty');
    }

    const workbook = XLSX.read(file.buffer, {
      type: 'buffer',
      cellDates: true,
    });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const rawMatrix = XLSX.utils.sheet_to_json<any[]>(worksheet, {
      header: 1,
      raw: true,
      defval: '',
    });

    if (!rawMatrix || rawMatrix.length < 2) {
      throw new BadRequestException(
        'The uploaded file is empty or contains no data rows',
      );
    }

    const rawHeaders: string[] = (rawMatrix[0] as any[]).map((h) =>
      h !== undefined && h !== null ? String(h).trim() : '',
    );

    const normalizedHeaderMap = new Map<number, string>();
    rawHeaders.forEach((header, idx) => {
      const canonical = normalizeHeader(header);
      if (canonical) normalizedHeaderMap.set(idx, canonical);
    });

    const presentHeaders = new Set(normalizedHeaderMap.values());
    const missingHeaders = REQUIRED_HEADERS.filter(
      (h) => !presentHeaders.has(h),
    );
    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `Missing required column(s): ${missingHeaders.join(', ')}`,
      );
    }

    const jobMatchColumns = {
      batch: presentHeaders.has(JOB_MATCH_COL.BATCH),
      reviewCollectionDate: presentHeaders.has(
        JOB_MATCH_COL.REVIEW_COLLECTION_DATE,
      ),
      propertyName: presentHeaders.has(JOB_MATCH_COL.PROPERTY_NAME),
    };
    this.logger.log(
      `Import file headers — recognized job-match columns: ${JSON.stringify(jobMatchColumns)}; ` +
        `raw header count=${rawHeaders.filter((h) => h).length}`,
    );
    if (!jobMatchColumns.reviewCollectionDate) {
      this.logger.warn(
        'Import file has no "Review Collection Date" column — bulk job resolution may fail when multiple jobs share the same OTA ID.',
      );
    }

    const cellToString = (cell: any): string => {
      if (cell === undefined || cell === null || cell === '') return '';
      if (cell instanceof Date) {
        const mm = String(cell.getMonth() + 1).padStart(2, '0');
        const dd = String(cell.getDate()).padStart(2, '0');
        const yyyy = cell.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
      }
      // Strip the Excel text formula prefix that the master export uses for
      // card-related fields, e.g. ="3700 2145 ..." or ="2031-02".
      let str = String(cell).trim();
      if (str.startsWith('="') && str.endsWith('"')) {
        str = str.slice(2, -1).replace(/""/g, '"');
      }
      return str;
    };

    const rows: Record<string, string>[] = (rawMatrix.slice(1) as any[][])
      .map((rowArr) => {
        const obj: Record<string, string> = {};
        normalizedHeaderMap.forEach((canonical, idx) => {
          obj[canonical] = cellToString(rowArr[idx]);
        });
        return obj;
      })
      .filter((obj) => Object.values(obj).some((v) => v !== ''));

    return { rows };
  }

  private jobResolveFail(
    message: string,
    logDetail: string,
  ): JobResolveFailure {
    return { ok: false, message, logDetail };
  }

  /** Shared post-parse logging for single and bulk job-item imports. */
  private logParsedImportFileSummary(
    fileLabel: string,
    rows: Record<string, string>[],
  ): void {
    this.logger.log(`Parsed ${rows.length} data row(s) from "${fileLabel}"`);
    if (rows.length === 0) return;

    const sample = rows[0];
    this.logger.log(
      `Sample row — OTA='${sample[COL.OTA] ?? ''}', OTA ID='${sample[COL.OTA_ID] ?? ''}', ` +
        `Batch='${sample[JOB_MATCH_COL.BATCH] ?? ''}', ` +
        `Review Collection Date='${sample[JOB_MATCH_COL.REVIEW_COLLECTION_DATE] ?? ''}', ` +
        `Property Name='${sample[JOB_MATCH_COL.PROPERTY_NAME] ?? ''}', ` +
        `Reservation ID='${sample[COL.RESERVATION_ID] ?? ''}'`,
    );
  }

  private readonly jobCandidateSelect = {
    id: true,
    end_date: true,
    property_name: true,
    property_id: true,
    batch_id: true,
    batch: { select: { name: true } },
  } as const;

  private getOtaIdField(
    ota: OTAProvider,
  ): 'expedia_id' | 'booking_id' | 'agoda_id' {
    return ota === OTAProvider.Expedia
      ? 'expedia_id'
      : ota === OTAProvider.Booking
        ? 'booking_id'
        : 'agoda_id';
  }

  /**
   * Resolves the canonical Property row for an OTA + numeric OTA ID.
   */
  private async resolvePropertyByOtaAndId(
    ota: OTAProvider,
    numericOtaId: number,
  ) {
    const otaIdField = this.getOtaIdField(ota);
    return this.db.property.findFirst({
      where: { [otaIdField]: numericOtaId },
    });
  }

  /**
   * Single-job import: prefer the property looked up from sheet OTA + OTA ID
   * so stale job.property_id / UI property_id mismatches do not block import.
   */
  private async resolvePropertyFromImportRows(
    rows: Record<string, string>[],
    jobOta: OTAProvider,
    fallbackPropertyId: string,
  ) {
    const firstRow = rows[0];
    const rowOta = firstRow?.[COL.OTA]?.trim() as OTAProvider | undefined;
    const rowOtaId = firstRow?.[COL.OTA_ID]?.trim();

    if (rowOtaId) {
      const numericOtaId = Number(rowOtaId);
      if (!Number.isNaN(numericOtaId)) {
        const lookupOta =
          rowOta && Object.values(OTAProvider).includes(rowOta)
            ? rowOta
            : jobOta;
        const fromSheet = await this.resolvePropertyByOtaAndId(
          lookupOta,
          numericOtaId,
        );
        if (fromSheet) {
          if (fallbackPropertyId && fromSheet.id !== fallbackPropertyId) {
            this.logger.warn(
              `Single import: using property ${fromSheet.id} from sheet OTA ID ${numericOtaId} ` +
                `instead of UI property_id ${fallbackPropertyId}`,
            );
          } else {
            this.logger.log(
              `Single import: resolved property ${fromSheet.id} from sheet ` +
                `OTA=${lookupOta}, OTA ID=${numericOtaId}`,
            );
          }
          return fromSheet;
        }
        this.logger.warn(
          `Single import: no property found for sheet OTA=${lookupOta}, ` +
            `OTA ID=${numericOtaId}; falling back to UI property_id ${fallbackPropertyId}`,
        );
      }
    }

    const fallback = await this.db.property.findUnique({
      where: { id: fallbackPropertyId },
    });
    if (!fallback) {
      this.logger.error(
        `Single import: fallback property_id '${fallbackPropertyId}' not found`,
      );
      throw new NotFoundException(
        `Property with id '${fallbackPropertyId}' not found`,
      );
    }
    this.logger.log(
      `Single import: using fallback property ${fallback.id} from UI property_id`,
    );
    return fallback;
  }

  /**
   * Loads candidate jobs for bulk import by OTA provider + OTA property ID
   * (via linked Property, RecurringJob.hotel_id, or exact property_name for
   * orphaned jobs whose property_id points at a deleted record).
   */
  private async findJobCandidatesForBulkImport(
    ota: OTAProvider,
    property: { id: string; name: string },
    otaIdField: 'expedia_id' | 'booking_id' | 'agoda_id',
    numericOtaId: number,
    propertyNameFromRow: string,
  ): Promise<{
    candidates: Array<{
      id: string;
      end_date: string | null;
      property_name: string;
      property_id: string | null;
      batch_id: string | null;
      batch: { name: string | null } | null;
    }>;
  }> {
    const nameForMatch = propertyNameFromRow || property.name;

    const propertyOtaFilter =
      otaIdField === 'expedia_id'
        ? { property: { expedia_id: numericOtaId } }
        : otaIdField === 'booking_id'
          ? { property: { booking_id: numericOtaId } }
          : { property: { agoda_id: numericOtaId } };

    const rows = await this.db.job.findMany({
      where: {
        ota_provider: ota,
        OR: [
          propertyOtaFilter,
          { recurringJob: { hotel_id: numericOtaId } },
          { property_name: nameForMatch },
        ],
      },
      select: {
        ...this.jobCandidateSelect,
        property: {
          select: { expedia_id: true, booking_id: true, agoda_id: true },
        },
        recurringJob: { select: { hotel_id: true } },
      },
    });

    const candidates = rows.filter((job) =>
      this.jobMatchesOtaId(job, otaIdField, numericOtaId, nameForMatch),
    );

    return { candidates };
  }

  private jobMatchesOtaId(
    job: {
      property_name: string;
      property?: {
        expedia_id?: number | null;
        booking_id?: number | null;
        agoda_id?: number | null;
      } | null;
      recurringJob?: { hotel_id?: number | null } | null;
    },
    otaIdField: 'expedia_id' | 'booking_id' | 'agoda_id',
    numericOtaId: number,
    propertyName: string,
  ): boolean {
    const fromProperty = readOtaIdFromPropertyRecord(
      otaIdField === 'expedia_id'
        ? OTAProvider.Expedia
        : otaIdField === 'booking_id'
          ? OTAProvider.Booking
          : OTAProvider.Agoda,
      job.property,
    );
    if (fromProperty != null) {
      return fromProperty === numericOtaId;
    }

    const fromRecurring = job.recurringJob?.hotel_id;
    if (fromRecurring != null) {
      return fromRecurring === numericOtaId;
    }

    return job.property_name === propertyName;
  }

  /**
   * Formats candidate jobs for resolution error messages / logs.
   */
  private formatJobResolveCandidates(
    jobs: Array<{
      id: string;
      end_date: string | null;
      property_name: string;
      property_id?: string | null;
      batch?: { name: string | null } | null;
    }>,
  ): string {
    return jobs
      .map(
        (j) =>
          `job_id=${j.id}, end_date=${j.end_date ?? '(empty)'}, property_name="${j.property_name}"` +
          `${j.property_id ? `, property_id=${j.property_id}` : ''}, batch="${j.batch?.name ?? ''}"`,
      )
      .join('; ');
  }

  /**
   * Resolves a job + property for a single row using OTA + OTA ID to find
   * candidate jobs (not job.property_id), then narrows with Batch, Review
   * Collection Date, and Property Name. The canonical property for persistence
   * comes from the OTA ID lookup on the Property table.
   */
  private async resolveJobFromRow(
    row: Record<string, string>,
    ota: OTAProvider,
  ): Promise<JobResolveResult> {
    const otaId = row[COL.OTA_ID]?.trim();
    if (!otaId) {
      return this.jobResolveFail(
        'OTA ID is missing — cannot look up the property.',
        'missing OTA ID on row',
      );
    }

    const numericOtaId = Number(otaId);
    if (Number.isNaN(numericOtaId)) {
      return this.jobResolveFail(
        `OTA ID '${otaId}' is not a valid number.`,
        `invalid OTA ID '${otaId}'`,
      );
    }

    const otaIdField = this.getOtaIdField(ota);

    const property = await this.resolvePropertyByOtaAndId(ota, numericOtaId);
    if (!property) {
      return this.jobResolveFail(
        `No property found with ${ota} OTA ID ${numericOtaId} (${otaIdField}).`,
        `no property where ${otaIdField}=${numericOtaId}`,
      );
    }

    const batchName = row[JOB_MATCH_COL.BATCH]?.trim() ?? '';
    const reviewCollectionDate =
      row[JOB_MATCH_COL.REVIEW_COLLECTION_DATE]?.trim() ?? '';
    const propertyName = row[JOB_MATCH_COL.PROPERTY_NAME]?.trim() ?? '';

    const normalizedReviewDate = reviewCollectionDate
      ? normalizeToMmDdYyyy(reviewCollectionDate)
      : null;
    if (reviewCollectionDate && !normalizedReviewDate) {
      return this.jobResolveFail(
        `Review Collection Date '${reviewCollectionDate}' could not be parsed. Use MM/DD/YYYY (e.g. 04/30/2026) or a display date like Apr 30, 2026.`,
        `unparseable Review Collection Date '${reviewCollectionDate}'`,
      );
    }

    const { candidates: initialCandidates } =
      await this.findJobCandidatesForBulkImport(
        ota,
        property,
        otaIdField,
        numericOtaId,
        propertyName,
      );

    this.logger.log(
      `OTA+OTA ID job lookup for ${ota} ${numericOtaId}: ${initialCandidates.length} candidate(s)`,
    );

    let candidates = initialCandidates;

    if (candidates.length === 0) {
      return this.jobResolveFail(
        `No ${ota} job exists for OTA ID ${numericOtaId} (property "${property.name}").`,
        `0 jobs for ota_provider=${ota}, ${otaIdField}=${numericOtaId}`,
      );
    }

    if (batchName) {
      const batch = await this.db.batch.findFirst({
        where: { name: batchName },
      });
      if (!batch) {
        return this.jobResolveFail(
          `Batch '${batchName}' was not found in the database.`,
          `batch name '${batchName}' not found`,
        );
      }
      const afterBatch = candidates.filter((j) => j.batch_id === batch.id);
      if (afterBatch.length === 0) {
        const batchLabels = [
          ...new Set(candidates.map((j) => j.batch?.name || '(none)')),
        ];
        return this.jobResolveFail(
          `Found ${candidates.length} ${ota} job(s) for OTA ID ${numericOtaId} but none in batch '${batchName}'. Jobs use batch(s): ${batchLabels.join(', ')}.`,
          `batch filter '${batchName}' eliminated all ${candidates.length} candidate(s); available batches: ${batchLabels.join(', ')}`,
        );
      }
      candidates = afterBatch;
    }

    if (propertyName) {
      const afterName = candidates.filter(
        (j) => j.property_name === propertyName,
      );
      if (afterName.length === 0) {
        const names = [...new Set(candidates.map((j) => j.property_name))];
        return this.jobResolveFail(
          `Found ${candidates.length} ${ota} job(s) for OTA ID ${numericOtaId} but none with Property Name '${propertyName}'. In DB: ${names.map((n) => `"${n}"`).join(', ')}.`,
          `property_name filter '${propertyName}' eliminated all ${candidates.length} candidate(s); DB property_name values: ${names.join(' | ')}`,
        );
      }
      candidates = afterName;
    }

    if (normalizedReviewDate) {
      const afterDate = candidates.filter(
        (j) =>
          normalizeToMmDdYyyy(j.end_date ?? undefined) === normalizedReviewDate,
      );
      if (afterDate.length === 0) {
        const dates = candidates.map((j) => j.end_date ?? '(empty)');
        return this.jobResolveFail(
          `Found ${candidates.length} matching ${ota} job(s) for OTA ID ${numericOtaId} but none with Review Collection Date ${normalizedReviewDate}. Job end_date values in DB: ${dates.join(', ')}.`,
          `end_date filter '${normalizedReviewDate}' eliminated all ${candidates.length} candidate(s); DB end_date values: ${dates.join(', ')}`,
        );
      }
      candidates = afterDate;
    } else if (candidates.length > 1) {
      return this.jobResolveFail(
        `Review Collection Date is empty but ${candidates.length} ${ota} jobs match OTA ID ${numericOtaId}` +
          `${propertyName ? ` and Property Name '${propertyName}'` : ''}` +
          `${batchName ? ` and Batch '${batchName}'` : ''}. ` +
          `Add Review Collection Date (job end_date, MM/DD/YYYY). Candidates: ${this.formatJobResolveCandidates(candidates)}.`,
        `ambiguous without Review Collection Date — ${candidates.length} candidates: ${this.formatJobResolveCandidates(candidates)}`,
      );
    }

    if (candidates.length > 1) {
      return this.jobResolveFail(
        `Multiple jobs (${candidates.length}) match the row. Narrow with Batch, Review Collection Date, and/or Property Name. Candidates: ${this.formatJobResolveCandidates(candidates)}.`,
        `ambiguous — ${candidates.length} candidates: ${this.formatJobResolveCandidates(candidates)}`,
      );
    }

    const job = await this.db.job.findUnique({
      where: { id: candidates[0].id },
    });
    if (!job) {
      return this.jobResolveFail(
        'Matched job could not be loaded.',
        `job id ${candidates[0].id} disappeared after candidate selection`,
      );
    }

    return { ok: true, job, property };
  }

  /**
   * Validates a set of rows against a single job's OTA provider and its
   * property's OTA ID. Returns row-level errors with 1-indexed sheet row
   * numbers (row 1 = header).
   */
  private validateRowsForJob(
    rows: Record<string, string>[],
    jobOta: OTAProvider,
    property: any,
  ): Array<{ row: number; message: string }> {
    const errors: Array<{ row: number; message: string }> = [];

    const propertyOtaIdMap: Record<OTAProvider, number | null> = {
      [OTAProvider.Expedia]: property.expedia_id ?? null,
      [OTAProvider.Agoda]: property.agoda_id ?? null,
      [OTAProvider.Booking]: property.booking_id ?? null,
    };
    const expectedOtaId = propertyOtaIdMap[jobOta];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const rowOta = row[COL.OTA]?.toString().trim();
      const rowOtaId = row[COL.OTA_ID]?.toString().trim();

      if (rowOta !== jobOta) {
        errors.push({
          row: rowNum,
          message: `OTA value '${rowOta}' does not match job OTA provider '${jobOta}'`,
        });
      }

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

      const requiredFields = OTA_REQUIRED_FIELDS[jobOta] ?? [];
      for (const field of requiredFields) {
        if (!row[field]?.toString().trim()) {
          errors.push({
            row: rowNum,
            message: `Required field '${field}' is missing or empty for OTA '${jobOta}'`,
          });
        }
      }

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

    return errors;
  }

  /**
   * Persists validated rows for a single job and marks the job as Completed.
   */
  private async persistRows(
    rows: Record<string, string>[],
    jobId: string,
    propertyId: string,
    otaProvider?: OTAProvider,
  ): Promise<JobItemUploadResult> {
    let created = 0;
    let updated = 0;
    const items: JobItem[] = [];

    for (const row of rows) {
      const jobItemData = mapRowToJobItemData(row, jobId, propertyId);
      try {
        const { item, wasCreated } =
          await this.jobItemRepository.upsertJobItem(jobItemData);
        items.push(item);
        if (wasCreated) {
          created++;
        } else {
          updated++;
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to upsert job item for job ${jobId}, reservation ` +
            `'${jobItemData.reservation_id}': ${err.message}`,
          err.stack,
        );
        throw err;
      }
    }

    await this.db.job.update({
      where: { id: jobId },
      data: { job_status: 'Completed', ...buildReplyWaitFields(otaProvider) },
    });

    this.logger.log(
      `Job ${jobId}: persisted — ${created} created, ${updated} updated. ` +
        `Job status set to Completed.`,
    );

    return { uploaded: items.length, created, updated, items };
  }
}
