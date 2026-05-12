import { Inject, Injectable, Logger } from '@nestjs/common';
import { JobItem } from '@prisma/client';
import {
  IScraperJobItemRepository,
  IScraperJobItemService,
  JobItemListMetadataDto,
  JobItemListRowDto,
} from './scraper-job-item.interface';
import { readPaymentCurrencyCode } from './scraper-job-item-payment.util';

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
}
