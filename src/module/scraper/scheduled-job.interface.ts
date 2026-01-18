import { ScheduledJob } from '@prisma/client';

export interface IScheduledJobRepository {
  createOrUpdateScheduledJob(
    date: string,
    jobIds: string[],
    retrievalIds?: string[],
  ): Promise<{
    scheduledJob: ScheduledJob;
    addedJobIds: string[];
    skippedJobIds: string[];
    addedRetrievalIds: string[];
    skippedRetrievalIds: string[];
  }>;
  findScheduledJobByDate(date: string): Promise<ScheduledJob | null>;
  findScheduledJobsForDate(date: string): Promise<ScheduledJob[]>;
  getAllScheduledJobs(): Promise<ScheduledJob[]>;
  findScheduledJobsByDateRange(
    startDate: string,
    endDate: string,
  ): Promise<ScheduledJob[]>;
  removeJobsFromScheduledJob(
    date: string,
    jobIds: string[],
    retrievalIds?: string[],
  ): Promise<{
    scheduledJob: ScheduledJob | null;
    removedJobIds: string[];
    notFoundJobIds: string[];
    removedRetrievalIds: string[];
    notFoundRetrievalIds: string[];
  }>;
}

export interface IScheduledJobService {
  createOrUpdateScheduledJob(
    date: string,
    jobIds: string[],
    retrievalIds?: string[],
  ): Promise<{
    addedCount: number;
    skippedCount: number;
    addedJobIds: string[];
    skippedJobIds: string[];
    addedRetrievalCount: number;
    skippedRetrievalCount: number;
    addedRetrievalIds: string[];
    skippedRetrievalIds: string[];
    scheduledJob: ScheduledJob;
  }>;
  getScheduledJobByDate(date: string): Promise<ScheduledJob | null>;
  getAllScheduledJobs(): Promise<ScheduledJob[]>;
  getScheduledJobsByDateRange(
    startDate: string,
    endDate: string,
  ): Promise<ScheduledJob[]>;
  removeJobsFromScheduledJob(
    date: string,
    jobIds: string[],
    retrievalIds?: string[],
  ): Promise<{
    removedCount: number;
    notFoundCount: number;
    removedJobIds: string[];
    notFoundJobIds: string[];
    removedRetrievalCount: number;
    notFoundRetrievalCount: number;
    removedRetrievalIds: string[];
    notFoundRetrievalIds: string[];
    scheduledJob: ScheduledJob | null;
  }>;
}
