import { Inject, Injectable, Logger } from '@nestjs/common';
import { JobItem } from '@prisma/client';
import * as XLSX from 'xlsx';
import {
  IScraperJobItemRepository,
  IScraperJobItemService,
  JobItemListMetadataDto,
  JobItemListRowDto,
  JobItemUpsertInput,
} from './scraper-job-item.interface';
import { readPaymentCurrencyCode } from './scraper-job-item-payment.util';

/** Currency prefix → ISO 4217 code map for COUNTRY$ patterns (e.g. US$, AU$). */
const COUNTRY_PREFIX_MAP: Record<string, string> = {
  US: 'USD',
  AU: 'AUD',
  CA: 'CAD',
  NZ: 'NZD',
  HK: 'HKD',
  SG: 'SGD',
  S: 'SGD',
  T: 'THB',
  '': 'USD',
};

/** Symbol → ISO 4217 code map for single-character symbols. */
const SYMBOL_MAP: Record<string, string> = {
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₩': 'KRW',
  '₹': 'INR',
};

/**
 * Parses an amount string like "US$464.74", "AU$100.00", "€50.00", "$30", "464.74".
 * Returns null when the string cannot be parsed as a number.
 */
function parseAmount(raw: string): { amount: number; currency: string } | null {
  const cleaned = String(raw ?? '').trim().replace(/\s/g, '');
  if (!cleaned) return null;

  // COUNTRY$ pattern: letters + $ + digits (e.g. "US$464.74", "AU$100")
  const dollarMatch = cleaned.match(/^([A-Za-z]*)\$([\d,]+\.?\d*)$/);
  if (dollarMatch) {
    const prefix = dollarMatch[1].toUpperCase();
    const amount = parseFloat(dollarMatch[2].replace(/,/g, ''));
    if (isNaN(amount)) return null;
    const currency = COUNTRY_PREFIX_MAP[prefix] ?? `${prefix}D`;
    return { amount, currency };
  }

  // Single symbol pattern: €, £, ¥, ₩, ₹ + digits
  const symbolMatch = cleaned.match(/^([€£¥₩₹])([\d,]+\.?\d*)$/);
  if (symbolMatch) {
    const amount = parseFloat(symbolMatch[2].replace(/,/g, ''));
    if (isNaN(amount)) return null;
    return { amount, currency: SYMBOL_MAP[symbolMatch[1]] ?? 'USD' };
  }

  // Plain number
  const num = parseFloat(cleaned.replace(/,/g, ''));
  if (!isNaN(num)) return { amount: num, currency: 'USD' };

  return null;
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
        const pi = row.payment_info;
        const currency = readPaymentCurrencyCode(pi);
        return {
          reservation_id: row.reservation_id ?? null,
          check_in: row.check_in_date,
          check_out: row.check_out_date,
          payment_info: {
            total_guest_payment: pi.total_guest_payment as number,
            amount_to_charge_or_refund: pi.amount_to_charge_or_refund as number,
            total_guest_payment_currency: currency,
            amount_to_charge_or_refund_currency: currency,
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

      validItems.push({
        job_id: jobId,
        property_id: propertyId,
        reservation_id: reservationId,
        payment_amount: parsed.amount,
        payment_currency: parsed.currency,
        charge_before: chargeBeforeRaw || null,
      });
    }

    if (!validItems.length) {
      return { created: 0, updated: 0, skipped, errors };
    }

    const result = await this.jobItemRepository.upsertJobItems(validItems);
    return { ...result, skipped, errors };
  }
}
