import { Injectable, Logger } from '@nestjs/common';
import { JobItem, OTAProvider } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  DerivedFieldsUpdate,
  IScraperJobItemRepository,
} from './scraper-job-item.interface';

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

      // Build the base filters
      let allFilters: any = {
        job_id: jobId,
      };

      // Handle reasonForCharge filter
      if (reason_for_charge) {
        allFilters.card_info = {
          is: {
            reason_for_charge: {
              equals: reason_for_charge,
            },
          },
        };
      }

      if (search) {
        allFilters.OR = [
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
        ];
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
