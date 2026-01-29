import { Job, RecurringJob } from '@prisma/client';
import {
  CreateRecurringJobDto,
  CreateRecurringJobFromJobDto,
  UpdateRecurringJobDto,
  UpdateRecurringJobStatusDto,
} from './recurring-job.dto';

export interface IRecurringJobRepository {
  create(data: any): Promise<RecurringJob>;
  findById(id: string): Promise<RecurringJob | null>;
  findByIdWithJobs(id: string): Promise<RecurringJob & { jobs: Job[] } | null>;
  findAll(query: Record<string, any>): Promise<{
    data: RecurringJob[];
    metadata: any;
  }>;
  update(id: string, data: any): Promise<RecurringJob>;
  delete(id: string): Promise<RecurringJob>;
  findJobsByRecurringId(recurringId: string): Promise<Job[]>;
}

export interface IRecurringJobService {
  createRecurringJob(
    data: CreateRecurringJobDto,
  ): Promise<{ recurringJob: RecurringJob; job: Job }>;
  createRecurringJobFromJob(
    data: CreateRecurringJobFromJobDto,
  ): Promise<{ recurringJob: RecurringJob; job: Job }>;
  getAllRecurringJobs(query: Record<string, any>): Promise<{
    data: RecurringJob[];
    metadata: any;
  }>;
  getRecurringJobById(id: string): Promise<RecurringJob & { jobs: Job[] }>;
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
}
