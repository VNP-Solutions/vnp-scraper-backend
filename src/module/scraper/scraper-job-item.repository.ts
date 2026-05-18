import { Injectable, Logger } from '@nestjs/common';
import { JobItem, OTAProvider } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { startOfDay } from '../job/job-item-derived.util';
import {
  DerivedFieldsUpdate,
  IScraperJobItemRepository,
} from './scraper-job-item.interface';

const OVER_160_DAYS = 160;

/**
 * Parses a query-string boolean ("true" / "false" / true / false). Returns
 * `undefined` when the value is missing or unparseable so the caller can
 * skip the filter entirely.
 */
function parseQueryBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return undefined;
}

/**
 * Returns the threshold date used by the `over_160` filter:
 *   check_out_date < (today − 160 days)  →  over_160 = true
 *
 * Computed from the start of today (local time) to match the day-granular
 * semantics in `daysBetween` / `computeDerivedJobItemFields`. Using a
 * date-based predicate (rather than the persisted `over_160` column)
 * keeps the filter consistent with the value the API actually returns,
 * even when the lazy cache for a row is stale.
 */
function getOver160ThresholdDate(today: Date = new Date()): Date {
  const t = startOfDay(today);
  t.setDate(t.getDate() - OVER_160_DAYS);
  return t;
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
  ): Promise<{ data: JobItem[]; metadata: any }> {
    try {
      const {
        page,
        limit,
        sortBy,
        sortOrder,
        search,
        start_date,
        end_date,
        reason_for_charge,
        over_160,
        ...filters
      } = query || {};

      const skip = page
        ? (parseInt(page || '1') - 1) * parseInt(limit || '10')
        : 0;
      const take = limit ? parseInt(limit) : 10;

      let orderBy = undefined;
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

      // `over_160` is an Expedia-only derived field equal to
      // (today − check_out_date) > 160 days. Filter on `check_out_date`
      // rather than the persisted `over_160` column so the result matches
      // the value the API returns today, even when a row's lazy cache is
      // stale. Implicitly restricts to Expedia jobs (Booking/Agoda always
      // surface this field as `null`).
      const over160Bool = parseQueryBoolean(over_160);
      if (over160Bool !== undefined) {
        const threshold = getOver160ThresholdDate();
        allFilters.job = {
          is: { ota_provider: OTAProvider.Expedia },
        };
        allFilters.check_out_date = over160Bool
          ? { lt: threshold }
          : { gte: threshold };
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

      const [jobItems, totalDocuments] = await Promise.all([
        this.db.jobItem.findMany({
          where: allFilters,
          skip,
          take,
          orderBy,
          include: {
            job: true,
            property: true,
            cardActivity: true,
          },
        }),
        this.db.jobItem.count({
          where: allFilters,
        }),
      ]);

      const metadata = {
        totalDocuments,
        currentPage: page ? parseInt(page) : 1,
        limit: take,
        totalPage: Math.ceil(totalDocuments / take),
      };

      return {
        data: jobItems,
        metadata,
      };
    } catch (error) {
      this.logger.error(`Error finding job items for job ${jobId}:`, error);
      return { data: [], metadata: null };
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

  /**
   * Writes the per-row derived-field updates produced by the service
   * layer's lazy materialization step. Each row is updated in parallel
   * because the values differ per row (no bulk-write API in Prisma can
   * express that). The `where` clause double-checks that the target
   * row's job is Expedia — see the interface JSDoc for rationale.
   *
   * Failures on individual rows are logged but never thrown, because
   * the caller is decorating a read response; a transient write failure
   * shouldn't break the user's request, it just means next read will
   * recompute and try again.
   */
  async bulkRefreshDerivedFields(
    updates: DerivedFieldsUpdate[],
  ): Promise<void> {
    if (!updates || updates.length === 0) return;
    await Promise.all(
      updates.map(async (u) => {
        try {
          await this.db.jobItem.updateMany({
            where: {
              id: u.id,
              // Defense-in-depth: only Expedia rows should ever receive
              // derived-field writes. If a non-Expedia id slips through
              // the service-layer filter, updateMany silently no-ops.
              job: { ota_provider: OTAProvider.Expedia },
            },
            data: {
              over_160: u.over_160,
              days_since_checkout: u.days_since_checkout,
              derived_calculated_at: u.derived_calculated_at,
            },
          });
        } catch (error) {
          this.logger.warn(
            `Failed to refresh derived fields for job item ${u.id}: ${
              (error as Error)?.message ?? error
            }`,
          );
        }
      }),
    );
  }
}
