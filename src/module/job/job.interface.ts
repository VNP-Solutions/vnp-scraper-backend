import { Batch, DbEntry, Job } from '@prisma/client';
import {
  CreateBatchDto,
  CreateJobDto,
  JobStatisticsResponseDto,
  UpdateBatchDto,
  UpdateJobDto,
} from './job.dto';

/** Row returned by GET /jobs (list): OTA, linked property document, job status. */
export interface JobScreenshotUrlDto {
  step: string;
  url: string;
  timestamp: string;
  type: string;
}

export interface JobCurrentOtpDto {
  id: string;
  otp: string;
  ota: string;
  job_id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobListItemDto {
  /** Job document id (Mongo ObjectId). */
  job_id: string;
  ota_name: string;
  /** Denormalized name on the job document (may differ from property.name if out of sync). */
  property_name: string | null;
  property: JobListPropertyDto | null;
  job_status: string;
  is_quick_job: boolean;
  otp_needed: boolean;
  otp_fulfilled: boolean;
  screenshot_urls: JobScreenshotUrlDto[];
  /** Latest JobCurrentOtp for this job, if any. */
  job_current_otp: JobCurrentOtpDto | null;
}

/** Property payload on job list (scalars + portfolio / sub-portfolio summary). */
export interface JobListPropertyDto {
  id: string;
  portfolio_id: string | null;
  sub_portfolio_id: string | null;
  name: string;
  expedia_id: number | null;
  expedia_status: string | null;
  booking_id: number | null;
  booking_status: string | null;
  agoda_id: number | null;
  agoda_status: string | null;
  createdAt: Date;
  updatedAt: Date;
  booking_trusted_status: string | null;
  booking_last_login: Date | null;
  phone_number: string | null;
  slot: number | null;
  phone_number_slot_id: string | null;
  portfolio: { id: string; name: string } | null;
  subPortfolio: { id: string; name: string } | null;
}

export interface IJobRepository {
  create(data: CreateJobDto): Promise<Job>;
  findById(id: string): Promise<Job>;
  findByIdForOtpSms(jobId: string): Promise<any>;
  findAll(query: Record<string, any>): Promise<{ data: any[]; metadata: any }>;
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
  ): Promise<{ data: JobListItemDto[]; metadata: any }>;
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
  exportSingleJobMasterCsv(
    jobId: string,
  ): Promise<{ buffer: Buffer; fileName: string }>;
  exportMasterCsvByRecurring(
    recurringId: string,
    bucketId: string,
  ): Promise<{ buffer: Buffer; fileName: string }>;
  sendOtpReminderSms(jobId: string): Promise<{
    job_id: string;
    to: string;
    provider: string;
    message_sid: string;
    phone_number: string;
    last_three_digits: string;
    message: string;
  }>;
}
