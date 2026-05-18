import { JobItem } from '@prisma/client';

/**
 * Shape of a single derived-fields update used by
 * IScraperJobItemRepository.bulkRefreshDerivedFields. One entry per
 * JobItem whose cached values went stale (or had never been computed).
 */
export interface DerivedFieldsUpdate {
  id: string;
  over_160: boolean | null;
  days_since_checkout: number | null;
  derived_calculated_at: Date;
}

export interface IScraperJobItemRepository {
  findAllByJobId(jobId: string): Promise<JobItem[]>;
  findAllByJobIdWithPagination(
    jobId: string,
    query?: Record<string, any>,
  ): Promise<{ data: JobItem[]; metadata: any }>;
  updateJobCurrentUrl(jobId: string, currentUrl: string): Promise<void>;
  /**
   * Batch-writes the lazily-computed `over_160`, `days_since_checkout`
   * and `derived_calculated_at` fields. Implementations MUST restrict
   * the update to Expedia rows (defense-in-depth — the service layer
   * already filters by OTA, but a hostile/buggy caller shouldn't be
   * able to dirty Booking/Agoda rows).
   */
  bulkRefreshDerivedFields(updates: DerivedFieldsUpdate[]): Promise<void>;
}

export interface IScraperJobItemService {
  getAllJobItemsByJobId(jobId: string): Promise<JobItem[]>;
  getJobItemsByJobIdWithPagination(
    jobId: string,
    query?: Record<string, any>,
  ): Promise<{ data: JobItem[]; metadata: any }>;
  updateJobCurrentUrl(jobId: string, currentUrl: string): Promise<void>;
}
