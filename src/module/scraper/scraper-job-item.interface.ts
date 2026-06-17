import { JobItem } from '@prisma/client';

export interface JobItemUpsertInput {
  job_id: string;
  property_id: string;
  reservation_id: string;
  payment_amount: number;
  payment_currency: string;
  charge_before?: string | null;
}

export interface JobItemUpsertResult {
  created: number;
  updated: number;
}

/** One row from GET /api/jobs/:jobId/items. */
export interface JobItemListRowDto {
  reservation_id: string | null;
  check_in: Date;
  check_out: Date;
  payment_info: {
    total_guest_payment: number | null;
    amount_to_charge_or_refund: number | null;
    amount_to_charge_or_refund_currency: string | null;
    charge_before: string | null;
  };
}

export interface JobItemListMetadataDto {
  /** All job items matching the same filters (used for totals, not limited by page). */
  total_reservations_count: number;
  /** Sum of `payment_info.amount_to_charge_or_refund` across all matching items (null/NaN skipped). */
  total_amount_to_charge_or_refund: number;
  /**
   * `amount_to_charge_or_refund_currency` from DB when every non-null currency on those rows matches; otherwise null.
   */
  total_amount_to_charge_or_refund_currency: string | null;
  /** Pagination for `data` only. */
  currentPage: number;
  limit: number;
  totalPage: number;
}

export interface IScraperJobItemRepository {
  findAllByJobId(jobId: string): Promise<JobItem[]>;
  findAllByJobIdWithPagination(
    jobId: string,
    query?: Record<string, any>,
  ): Promise<{ data: any[]; metadata: JobItemListMetadataDto }>;
  updateJobCurrentUrl(jobId: string, currentUrl: string): Promise<void>;
  upsertJobItems(items: JobItemUpsertInput[]): Promise<JobItemUpsertResult>;
  completeJob(jobId: string): Promise<{
    wasAlreadyCompleted: boolean;
    phone_number_for_report: string | null;
  }>;
}

export interface IScraperJobItemService {
  getAllJobItemsByJobId(jobId: string): Promise<JobItem[]>;
  getJobItemsByJobIdWithPagination(
    jobId: string,
    query?: Record<string, any>,
  ): Promise<{ data: JobItemListRowDto[]; metadata: JobItemListMetadataDto }>;
  updateJobCurrentUrl(jobId: string, currentUrl: string): Promise<void>;
  uploadJobItemsFromExcel(
    file: Express.Multer.File,
    jobId: string,
    propertyId: string,
    portfolioId: string,
  ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }>;
}
