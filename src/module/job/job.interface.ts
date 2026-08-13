import { Batch, DbEntry, Job, JobStatus } from '@prisma/client';
import { Writable } from 'stream';
import {
  BulkCreateJobFromDbmsItemDto,
  BulkCreateJobFromDbmsResultDto,
  CreateBatchDto,
  CreateJobDto,
  JobStatisticsResponseDto,
  UpdateBatchDto,
  UpdateJobDto,
} from './job.dto';
import type { JobListItem } from './job-list.types';

export interface IJobRepository {
  create(data: CreateJobDto): Promise<Job>;
  findById(id: string): Promise<Job>;
  findAll(query: Record<string, any>): Promise<{ data: Job[]; metadata: any }>;
  update(id: string, data: UpdateJobDto): Promise<Job>;
  delete(id: string): Promise<Job>;
  findPortfolioByName(name: string): Promise<any>;
  findSubPortfolioByNameAndPortfolio(
    name: string,
    portfolioId: string,
  ): Promise<any>;
  findPropertyByNameAndRelations(
    name: string,
    portfolioId?: string,
    subPortfolioId?: string,
  ): Promise<any>;
  findLatestCheckoutDateByJobId(
    jobId: string,
  ): Promise<{ check_out_date: Date } | null>;
  getJobStatisticsByUserId(
    userId: string,
    isAdmin: boolean,
  ): Promise<JobStatisticsResponseDto>;
  getJobStatusCounts(userId?: string): Promise<{
    pending: { count: number; percentage: number };
    failed: { count: number; percentage: number };
    running: { count: number; percentage: number };
    completed: { count: number; percentage: number };
    stopped: { count: number; percentage: number };
    nothingToReport: { count: number; percentage: number };
    manual: { count: number; percentage: number };
    total: number;
  }>;
  getMonthlyJobStats(userId?: string): Promise<
    Array<{
      month: string;
      pending: { count: number; percentage: number };
      failed: { count: number; percentage: number };
      running: { count: number; percentage: number };
      completed: { count: number; percentage: number };
      stopped: { count: number; percentage: number };
      nothingToReport: { count: number; percentage: number };
      manual: { count: number; percentage: number };
      total: number;
    }>
  >;

  // Batch repository methods
  createBatch(data: CreateBatchDto): Promise<Batch>;
  findBatchById(id: string): Promise<Batch>;
  findBatchByName(name: string): Promise<Batch | null>;
  findAllBatches(query: Record<string, any>): Promise<Batch[]>;
  updateBatch(id: string, data: UpdateBatchDto): Promise<Batch>;
  deleteBatch(id: string): Promise<Batch>;
  bulkBatchUpdate(
    jobIds: string[],
    batchId: string,
  ): Promise<{ count: number }>;
  bulkArchiveUpdate(
    jobIds: string[],
    isArchived: boolean,
  ): Promise<{ count: number }>;
  bulkStatusUpdate(
    jobIds: string[],
    jobStatus: JobStatus,
  ): Promise<{ count: number }>;
  bulkDelete(
    jobIds: string[],
  ): Promise<{ count: number; deletedJobIds: string[] }>;
  bulkDeleteBatches(batchIds: string[]): Promise<{
    deletedCount: number;
    skippedCount: number;
    deletedBatchIds: string[];
    skippedBatches: Array<{
      batch_id: string;
      batch_name: string;
      job_count: number;
      reason: string;
    }>;
  }>;
  findDbEntriesByJobId(jobId: string): Promise<DbEntry[]>;
  findManyForMasterExport(jobIds: string[]): Promise<any[]>;
  /**
   * Pre-scan that returns just enough info to define the XLSX column
   * shape (Expedia presence + max approved-authorization count) and
   * which job IDs actually exist. Used by the streaming export path so
   * we can decide headers BEFORE pulling row data.
   */
  precomputeMasterExportContext(jobIds: string[]): Promise<{
    hasExpedia: boolean;
    maxApprovedCount: number;
    foundIds: Set<string>;
  }>;
  /** Cheap `{ id }` lookup — used by per-job ZIP export pre-flight only. */
  findExistingJobIdsForExport(jobIds: string[]): Promise<Set<string>>;
  /**
   * Lightweight `count` of how many `JobItem` rows belong to the given
   * `jobIds`. Used as a cheap pre-flight check by streaming exports so
   * we can `404` before opening any S3 upload.
   */
  countJobItemsByJobIds(jobIds: string[]): Promise<number>;
  /**
   * Async generator counterpart to {@link findManyForMasterExport}.
   * Yields one job at a time (with the same `MASTER_EXPORT_SELECT`
   * projection); peak heap is bounded by `batchSize`, not by the
   * total number of jobs being exported. The streaming master /
   * consolidated / dashboard / ZIP exporters all use this.
   */
  streamJobsForMasterExport(
    jobIds: string[],
    batchSize?: number,
  ): AsyncGenerator<any, void, void>;
  findJobIdsByRecurring(
    recurringId: string,
    bucketId: string,
  ): Promise<string[]>;
}

export interface IJobService {
  createJob(data: CreateJobDto): Promise<Job>;
  bulkCreateFromDbms(
    items: BulkCreateJobFromDbmsItemDto[],
  ): Promise<BulkCreateJobFromDbmsResultDto>;
  getAllJobs(
    query: Record<string, any>,
  ): Promise<{ data: JobListItem[]; metadata: any }>;
  getJobById(id: string): Promise<Job>;
  updateJob(id: string, data: UpdateJobDto): Promise<Job>;
  deleteJob(id: string): Promise<Job>;
  importJobsFromExcel(
    file: Express.Multer.File,
    userId: string,
  ): Promise<{
    jobsCreated: number;
    jobs: any[];
    scheduledJobsCreated: number;
    scheduledJobs: Array<{ date: string; jobIds: string[] }>;
    recurringJobsCreated: number;
    recurringJobs: any[];
  }>;
  getLatestCheckoutDateByJobId(
    jobId: string,
  ): Promise<{ check_out_date: Date } | null>;
  getJobStatistics(
    userId: string,
    userRole: string,
  ): Promise<JobStatisticsResponseDto>;

  // Batch service methods
  createBatch(data: CreateBatchDto): Promise<Batch>;
  getAllBatches(query: Record<string, any>): Promise<Batch[]>;
  getBatchById(id: string): Promise<Batch>;
  findBatchByName(name: string): Promise<Batch | null>;
  updateBatch(id: string, data: UpdateBatchDto): Promise<Batch>;
  deleteBatch(id: string): Promise<Batch>;
  bulkBatchUpdate(
    jobIds: string[],
    batchId: string,
  ): Promise<{ updatedCount: number; batch_id: string }>;
  bulkArchiveUpdate(
    jobIds: string[],
    status: boolean,
  ): Promise<{ updatedCount: number; status: boolean }>;
  bulkStatusUpdate(
    jobIds: string[],
    jobStatus: JobStatus,
  ): Promise<{ updatedCount: number; job_status: JobStatus }>;
  bulkDeleteJobs(
    jobIds: string[],
  ): Promise<{ deletedCount: number; deletedJobIds: string[] }>;
  bulkDeleteBatches(batchIds: string[]): Promise<{
    deletedCount: number;
    skippedCount: number;
    deletedBatchIds: string[];
    skippedBatches: Array<{
      batch_id: string;
      batch_name: string;
      job_count: number;
      reason: string;
    }>;
  }>;
  getDbEntriesByJobId(jobId: string): Promise<any[]>;
  exportMasterCsv(
    jobIds: string[],
  ): Promise<{ buffer: Buffer; fileName: string }>;
  buildMasterXlsxEntries(
    jobIds: string[],
  ): Promise<Array<{ name: string; data: Buffer }>>;
  /**
   * Consolidated export — every (job, jobItem) row from the given
   * jobIds rendered into ONE XLSX workbook (single "Master" sheet),
   * using the exact same headers / per-OTA logic as the per-job CSV.
   * Returns a single buffer ready to stream as the response body.
   */
  buildConsolidatedMasterXlsx(
    jobIds: string[],
  ): Promise<{ buffer: Buffer; fileName: string }>;
  /**
   * Dashboard export — every (job, jobItem) row from the given jobIds
   * rendered into ONE XLSX workbook (single "Dashboard" sheet) using
   * the simplified dashboard column spec (OTA, Hotel ID, Batch, Review
   * Collection Date, Portfolio, Hotel Name, Reservation ID, Status,
   * Name, Check In/Out, Currency, Amount Collected, and the 85 / 15
   * Due To Property / Due To VNP split). Distinct from
   * `buildConsolidatedMasterXlsx`, which emits the full master spec.
   */
  buildDashboardXlsx(
    jobIds: string[],
  ): Promise<{ buffer: Buffer; fileName: string }>;

  /**
   * Streaming variants of the three export builders. They write the
   * file bytes directly to the provided `writable` (typically a
   * `PassThrough` wired into an S3 multipart upload), using ExcelJS
   * `WorkbookWriter` so memory stays bounded regardless of how many
   * jobs are in the export.
   *
   * These power the async export path (`> 10 jobs` in the Reports
   * module). The Buffer-returning variants above keep serving the
   * synchronous path (`≤ 10 jobs`) because for small exports the
   * memory savings don't matter and the buffer API is simpler.
   *
   * Returns the suggested file name. The writable is closed by the
   * implementation when writing is complete (or errored).
   */
  streamConsolidatedMasterXlsx(
    jobIds: string[],
    writable: Writable,
  ): Promise<{ fileName: string }>;
  streamDashboardXlsx(
    jobIds: string[],
    writable: Writable,
  ): Promise<{ fileName: string }>;
  streamMasterXlsxZip(
    jobIds: string[],
    writable: Writable,
  ): Promise<{ fileName: string }>;

  exportSingleJobMasterCsv(
    jobId: string,
  ): Promise<{ buffer: Buffer; fileName: string }>;
  exportMasterCsvByRecurring(
    recurringId: string,
    bucketId: string,
  ): Promise<{ buffer: Buffer; fileName: string }>;
  triggerLambdaForPlatform(platform: string): Promise<void>;
}
