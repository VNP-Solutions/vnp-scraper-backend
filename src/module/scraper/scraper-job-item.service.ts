import { Inject, Injectable, Logger } from '@nestjs/common';
import { JobItem } from '@prisma/client';
import * as XLSX from 'xlsx';
import { sendAuditReadySms } from 'src/common/audit-ready-sms';
import {
  IScraperJobItemRepository,
  IScraperJobItemService,
  JobItemListMetadataDto,
  JobItemListRowDto,
  JobItemUpsertInput,
} from './scraper-job-item.interface';
import { parseAmount } from './scraper-job-item-payment.util';

/**
 * Parses a human-readable date string (e.g. "Jun 11, 2027", "June 11 2027", "2027-06-11")
 * and returns an ISO date string "YYYY-MM-DD", or null if unparseable.
 */
function parseToIsoDate(raw: string): string | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Finds the first key in a row whose lowercased name contains the given substring.
 * Returns null if nothing matches.
 */
function findColumn(row: Record<string, any>, substring: string): string | null {
  for (const key of Object.keys(row)) {
    if (key.toLowerCase().includes(substring.toLowerCase())) return key;
  }
  return null;
}

@Injectable()
export class ScraperJobItemService implements IScraperJobItemService {
  constructor(
    @Inject('IScraperJobItemRepository')
    private readonly jobItemRepository: IScraperJobItemRepository,
    private readonly logger: Logger,
  ) {}

  async getAllJobItemsByJobId(jobId: string): Promise<JobItem[]> {
    try {
      const jobItems = await this.jobItemRepository.findAllByJobId(jobId);
      return jobItems;
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
  ): Promise<{ data: JobItemListRowDto[]; metadata: JobItemListMetadataDto }> {
    try {
      const result = await this.jobItemRepository.findAllByJobIdWithPagination(
        jobId,
        query,
      );
      const data: JobItemListRowDto[] = (result.data || []).map((row: any) => {
        const pi = row.payment_info ?? {};
        return {
          reservation_id: row.reservation_id ?? null,
          check_in: row.check_in_date,
          check_out: row.check_out_date,
          payment_info: {
            total_guest_payment: pi.total_guest_payment ?? null,
            amount_to_charge_or_refund: pi.amount_to_charge_or_refund ?? null,
            amount_to_charge_or_refund_currency:
              pi.amount_to_charge_or_refund_currency ?? null,
            charge_before: pi.charge_before ?? null,
          },
        };
      });
      return { data, metadata: result.metadata };
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

  async uploadJobItemsFromExcel(
    file: Express.Multer.File,
    jobId: string,
    propertyId: string,
    portfolioId: string,
  ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    if (!file?.buffer) {
      throw new Error('File buffer is empty');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: '',
    });

    if (!rows.length) {
      return { created: 0, updated: 0, skipped: 0, errors: ['Sheet is empty'] };
    }

    const errors: string[] = [];
    const validItems: JobItemUpsertInput[] = [];
    let skipped = 0;

    // Detect column names from the first row
    const firstRow = rows[0];
    const reservationCol = findColumn(firstRow, 'reservation');
    const amountCol = findColumn(firstRow, 'amount');
    const chargeBeforeCol = findColumn(firstRow, 'charge before') ?? findColumn(firstRow, 'chargebefore');

    if (!reservationCol) {
      throw new Error(
        'Could not find a "Reservation" column. Expected a column name containing "reservation" (e.g. "Reservation info", "Reservation ID").',
      );
    }
    if (!amountCol) {
      throw new Error(
        'Could not find an "Amount" column. Expected a column name containing "amount" (e.g. "Amount", "Total Amount").',
      );
    }

    this.logger.log(
      `uploadJobItemsFromExcel: using columns reservation="${reservationCol}", amount="${amountCol}", chargeBefore="${chargeBeforeCol ?? 'not found'}" | rows=${rows.length} | jobId=${jobId}`,
    );

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed + header row

      const reservationId = String(row[reservationCol] ?? '').trim();
      if (!reservationId) {
        skipped++;
        continue;
      }

      const rawAmount = String(row[amountCol] ?? '').trim();
      const parsed = parseAmount(rawAmount);
      if (!parsed) {
        errors.push(`Row ${rowNum}: could not parse amount "${rawAmount}" for reservation "${reservationId}"`);
        skipped++;
        continue;
      }

      const chargeBeforeRaw = chargeBeforeCol
        ? String(row[chargeBeforeCol] ?? '').trim()
        : '';
      const chargeBeforeIso = chargeBeforeRaw
        ? parseToIsoDate(chargeBeforeRaw)
        : null;

      validItems.push({
        job_id: jobId,
        property_id: propertyId,
        reservation_id: reservationId,
        payment_amount: parsed.amount,
        payment_currency: parsed.currency,
        charge_before: chargeBeforeIso,
      });
    }

    if (!validItems.length) {
      return { created: 0, updated: 0, skipped, errors };
    }

    const result = await this.jobItemRepository.upsertJobItems(validItems);

    const completion = await this.jobItemRepository.completeJob(jobId);
    const reportPhone = completion.phone_number_for_report?.trim();
    if (!completion.wasAlreadyCompleted && reportPhone) {
      try {
        await sendAuditReadySms(reportPhone, jobId);
        this.logger.log(
          `Sent audit-ready SMS for job ${jobId} to ${reportPhone}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send audit-ready SMS for job ${jobId}: ${error.message}`,
          error.stack,
        );
      }
    }

    return { ...result, skipped, errors };
  }
}
