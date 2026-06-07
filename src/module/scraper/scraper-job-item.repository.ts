import { Injectable, Logger } from '@nestjs/common';
import { JobItem, Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  IScraperJobItemRepository,
  JobItemListMetadataDto,
  JobItemUpsertInput,
  JobItemUpsertResult,
} from './scraper-job-item.interface';
import { readPaymentCurrencyCode } from './scraper-job-item-payment.util';

function isMeaningfulPayment(paymentInfo: unknown): boolean {
  if (!paymentInfo || typeof paymentInfo !== 'object') return false;
  const pi = paymentInfo as Record<string, unknown>;
  const t = pi.total_guest_payment;
  const a = pi.amount_to_charge_or_refund;
  const tOk = typeof t === 'number' && !Number.isNaN(t) && t !== 0;
  const aOk = typeof a === 'number' && !Number.isNaN(a) && a !== 0;
  return tOk && aOk;
}

function resolveAggregateCurrency(
  rows: Array<{ payment_info: unknown }>,
): string | null {
  const codes = new Set<string>();
  for (const row of rows) {
    const c = readPaymentCurrencyCode(row.payment_info);
    if (c) {
      codes.add(c.toUpperCase());
    }
  }
  if (codes.size === 0) return null;
  if (codes.size === 1) return [...codes][0];
  return null;
}

@Injectable()
export class ScraperJobItemRepository implements IScraperJobItemRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  async findAllByJobId(jobId: string): Promise<JobItem[]> {
    try {
      const jobItems = await this.db.jobItem.findMany({
        where: { job_id: jobId },
        include: {
          job: true,
          property: {
            include: {
              portfolio: true,
              subPortfolio: {
                include: {
                  portfolio: true,
                },
              },
            },
          },
          cardActivity: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      return jobItems;
    } catch (error) {
      this.logger.error(`Error finding job items for job ${jobId}:`, error);
      throw error;
    }
  }

  async findAllByJobIdWithPagination(
    jobId: string,
    query?: Record<string, any>,
  ): Promise<{ data: any[]; metadata: JobItemListMetadataDto }> {
    try {
      const {
        sortBy,
        sortOrder,
        search,
        start_date,
        end_date,
        reason_for_charge,
        page: _page,
        limit: _limit,
        ...filters
      } = query || {};

      const listSelect = {
        reservation_id: true,
        check_in_date: true,
        check_out_date: true,
        payment_info: {
          select: {
            total_guest_payment: true,
            amount_to_charge_or_refund: true,
            amount_to_charge_or_refund_currency: true,
            cancellation_fee: true,
            total_payout: true,
            charge_before: true,
          },
        },
      } satisfies Prisma.JobItemSelect;

      let orderBy: Prisma.JobItemOrderByWithRelationInput = {
        createdAt: 'desc',
      };
      if (sortBy) {
        orderBy = {
          [sortBy]: sortOrder?.toLowerCase() === 'desc' ? 'desc' : 'asc',
        };
      }

      if (start_date && end_date) {
        filters.createdAt = {
          gte: new Date(start_date),
          lte: new Date(end_date),
        };
      }

      let allFilters: any = {
        job_id: jobId,
        ...filters,
      };

      if (reason_for_charge) {
        allFilters.card_info = {
          is: {
            reason_for_charge: reason_for_charge,
          },
        };
      }

      if (search) {
        allFilters = {
          ...allFilters,
          OR: [
            {
              guest_name: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              reservation_id: {
                contains: search,
                mode: 'insensitive',
              },
            },
          ],
        };
      }

      const forAggregates = await this.db.jobItem.findMany({
        where: allFilters,
        select: {
          payment_info: {
            select: {
              amount_to_charge_or_refund: true,
              amount_to_charge_or_refund_currency: true,
            },
          },
        },
      });

      const total_reservations_count = forAggregates.length;
      const total_amount_to_charge_or_refund = Math.round(
        forAggregates.reduce((sum, row) => {
          const v = row.payment_info?.amount_to_charge_or_refund;
          if (typeof v === 'number' && !Number.isNaN(v)) {
            return sum + v;
          }
          return sum;
        }, 0) * 100,
      ) / 100;

      const total_amount_to_charge_or_refund_currency =
        resolveAggregateCurrency(forAggregates);

      const batchSize = 100;
      const maxScan = 50_000;
      const jobItems: any[] = [];
      let skip = 0;
      while (jobItems.length < 3 && skip < maxScan) {
        const batch = await this.db.jobItem.findMany({
          where: allFilters,
          select: listSelect,
          orderBy,
          skip,
          take: batchSize,
        });
        if (batch.length === 0) break;
        for (const row of batch) {
          if (isMeaningfulPayment(row.payment_info)) {
            jobItems.push(row);
            if (jobItems.length >= 3) break;
          }
        }
        skip += batchSize;
        if (batch.length < batchSize) break;
      }

      const metadata: JobItemListMetadataDto = {
        total_reservations_count,
        total_amount_to_charge_or_refund,
        total_amount_to_charge_or_refund_currency,
      };

      return {
        data: jobItems,
        metadata,
      };
    } catch (error) {
      this.logger.error(`Error finding job items for job ${jobId}:`, error);
      throw error;
    }
  }

  async updateJobCurrentUrl(jobId: string, currentUrl: string): Promise<void> {
    try {
      await this.db.job.update({
        where: { id: jobId },
        data: { current_url: currentUrl },
      });
      this.logger.log(`Successfully updated current_url for job ${jobId}`);
    } catch (error) {
      this.logger.error(`Error updating current_url for job ${jobId}:`, error);
      throw error;
    }
  }

  async upsertJobItems(items: JobItemUpsertInput[]): Promise<JobItemUpsertResult> {
    let created = 0;
    let updated = 0;

    for (const item of items) {
      const paymentInfo: Prisma.PaymentInfoCreateInput = {
        total_guest_payment: item.payment_amount,
        total_payout: item.payment_amount,
        amount_to_charge_or_refund: item.payment_amount,
        amount_to_charge_or_refund_currency: item.payment_currency,
        charge_before: item.charge_before ?? null,
      };

      const existing = await this.db.jobItem.findUnique({
        where: {
          job_id_reservation_id: {
            job_id: item.job_id,
            reservation_id: item.reservation_id,
          },
        },
        select: { id: true },
      });

      if (existing) {
        await this.db.jobItem.update({
          where: { id: existing.id },
          data: {
            has_payment_info: true,
            payment_info: paymentInfo,
          },
        });
        updated++;
      } else {
        const now = new Date();
        await this.db.jobItem.create({
          data: {
            job_id: item.job_id,
            property_id: item.property_id,
            reservation_id: item.reservation_id,
            guest_name: '',
            check_in_date: now,
            check_out_date: now,
            room_type: '',
            booked_date: now,
            reservation_status: 'Active',
            has_payment_info: true,
            payment_info: paymentInfo,
          },
        });
        created++;
      }
    }

    this.logger.log(`upsertJobItems: created=${created}, updated=${updated}`);
    return { created, updated };
  }
}
