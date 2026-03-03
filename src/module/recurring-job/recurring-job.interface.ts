import { Job, RecurringJob, RecurringReportBucket } from '@prisma/client';
import {
  CreateRecurringJobDto,
  CreateRecurringJobFromJobDto,
  UpdateRecurringJobDto,
  UpdateRecurringJobStatusDto,
} from './recurring-job.dto';

export type RecurringJobWithBucketsAndJobs = RecurringJob & {
  buckets: (RecurringReportBucket & { jobs: Job[] })[];
  jobs: Job[];
};

export interface IRecurringJobRepository {
  create(data: any): Promise<RecurringJob>;
  findById(id: string): Promise<RecurringJob | null>;
  findByName(name: string): Promise<RecurringJob | null>;
  findByIdWithJobs(
    id: string,
  ): Promise<RecurringJobWithBucketsAndJobs | null>;
  findAll(query: Record<string, any>): Promise<{
    data: RecurringJob[];
    metadata: any;
  }>;
  update(id: string, data: any): Promise<RecurringJob>;
  delete(id: string): Promise<RecurringJob>;
  bulkDelete(ids: string[]): Promise<number>;
  findJobsByRecurringId(recurringId: string): Promise<Job[]>;

  // Bucket methods
  createBucket(data: {
    recurring_id: string;
    bucket_number: number;
    name: string;
  }): Promise<RecurringReportBucket>;
  findBucketById(id: string): Promise<RecurringReportBucket | null>;
  findBucketsByRecurringId(
    recurringId: string,
  ): Promise<(RecurringReportBucket & { jobs: Job[] })[]>;
  findLatestBucketByRecurringId(
    recurringId: string,
  ): Promise<(RecurringReportBucket & { jobs: Job[] }) | null>;
  findBucketWithJobs(
    bucketId: string,
  ): Promise<(RecurringReportBucket & { jobs: Job[] }) | null>;
  countJobsInBucket(bucketId: string): Promise<number>;
}

export interface IRecurringJobService {
  createRecurringJob(
    data: CreateRecurringJobDto,
  ): Promise<{ recurringJob: RecurringJob; bucket: RecurringReportBucket; job: Job }>;
  createRecurringJobFromJob(
    data: CreateRecurringJobFromJobDto,
  ): Promise<{ recurringJob: RecurringJob; bucket: RecurringReportBucket; job: Job }>;
  getAllRecurringJobs(query: Record<string, any>): Promise<{
    data: any[];
    metadata: any;
  }>;
  getRecurringJobById(
    id: string,
  ): Promise<RecurringJobWithBucketsAndJobs>;
  updateRecurringJob(
    id: string,
    data: UpdateRecurringJobDto,
  ): Promise<RecurringJob>;
  updateRecurringJobStatus(
    id: string,
    data: UpdateRecurringJobStatusDto,
  ): Promise<RecurringJob>;
  deleteRecurringJob(id: string): Promise<RecurringJob>;
  createNextMonthJob(
    recurringId: string,
    currentScheduleDate: string,
  ): Promise<Job | null>;
  getBucketsByRecurringId(
    recurringId: string,
    query: Record<string, any>,
  ): Promise<{
    data: any[];
    metadata: any;
  }>;
  bulkDeleteRecurringJobs(ids: string[]): Promise<{
    deletedCount: number;
    deletedIds: string[];
  }>;
  getBucketJobs(bucketId: string): Promise<Job[]>;
}
