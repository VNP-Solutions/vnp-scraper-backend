import { Batch, DbEntry, Job } from '@prisma/client';
import {
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
  findJobIdsByRecurring(
    recurringId: string,
    bucketId: string,
  ): Promise<string[]>;
}

export interface IJobService {
  createJob(data: CreateJobDto): Promise<Job>;
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
  exportSingleJobMasterCsv(
    jobId: string,
  ): Promise<{ buffer: Buffer; fileName: string }>;
  exportMasterCsvByRecurring(
    recurringId: string,
    bucketId: string,
  ): Promise<{ buffer: Buffer; fileName: string }>;
  triggerLambdaForPlatform(platform: string): Promise<void>;
}
