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

export interface JobItemUploadRow {
  job_id: string;
  property_id: string;
  guest_name: string;
  reservation_id: string | null;
  confirmation_number: string | null;
  check_in_date: Date;
  check_out_date: Date;
  room_type: string;
  booked_date: Date;
  has_card_info: boolean;
  card_info?: {
    card_number: string;
    expiry_date: string;
    cvv?: string;
    reason_for_charge?: string;
  };
  has_payment_info: boolean;
  payment_info?: {
    amount_to_charge_or_refund: number;
    total_payout?: number;
    amount_to_charge_or_refund_currency?: string;
    charge_before?: string;
  };
  reservation_status: string;
}

export interface JobItemUploadResult {
  uploaded: number;
  created: number;
  updated: number;
  items: JobItem[];
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
  upsertJobItem(row: JobItemUploadRow): Promise<{ item: JobItem; wasCreated: boolean }>;
}

export interface IScraperJobItemService {
  getAllJobItemsByJobId(jobId: string): Promise<JobItem[]>;
  getJobItemsByJobIdWithPagination(
    jobId: string,
    query?: Record<string, any>,
  ): Promise<{ data: JobItem[]; metadata: any }>;
  updateJobCurrentUrl(jobId: string, currentUrl: string): Promise<void>;
  uploadJobItemsFromFile(
    jobId: string,
    propertyId: string,
    file: Express.Multer.File,
  ): Promise<JobItemUploadResult>;
}
