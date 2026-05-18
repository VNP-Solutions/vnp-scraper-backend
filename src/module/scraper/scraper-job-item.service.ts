import { Inject, Injectable, Logger } from '@nestjs/common';
import { JobItem, OTAProvider } from '@prisma/client';
import {
  computeDerivedJobItemFields,
  isDerivedFresh,
} from '../job/job-item-derived.util';
import {
  DerivedFieldsUpdate,
  IScraperJobItemRepository,
  IScraperJobItemService,
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

@Injectable()
export class ScraperJobItemService implements IScraperJobItemService {
  constructor(
    @Inject('IScraperJobItemRepository')
    private readonly jobItemRepository: IScraperJobItemRepository,
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
}
