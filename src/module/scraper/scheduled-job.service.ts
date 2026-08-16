import { Inject, Injectable, Logger } from '@nestjs/common';
import { Job, JobStatus, ScheduledJob } from '@prisma/client';
import {
  IScheduledJobRepository,
  IScheduledJobService,
} from './scheduled-job.interface';

@Injectable()
export class ScheduledJobService implements IScheduledJobService {
  constructor(
    @Inject('IScheduledJobRepository')
    private readonly repository: IScheduledJobRepository,
    private readonly logger: Logger,
  ) {}

  async getJobsByScheduleDateAndStatus(
    scheduleDate: string,
    status: JobStatus,
  ): Promise<Job[]> {
    try {
      if (!scheduleDate || !/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) {
        throw new Error('Schedule date must be in YYYY-MM-DD format');
      }
      return await this.repository.getJobsByScheduleDateAndStatus(
        scheduleDate,
        status,
      );
    } catch (error) {
      this.logger.error(
        `Error fetching jobs by schedule_date and status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async createScheduledJobByDate(
    date: string,
    jobIds: string[] = [],
  ): Promise<ScheduledJob> {
    try {
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Date must be in YYYY-MM-DD format');
      }
      return await this.repository.createScheduledJobByDate(date, jobIds);
    } catch (error) {
      this.logger.error(
        `Error creating scheduled job by date: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async createOrUpdateScheduledJob(
    date: string,
    jobIds: string[],
    retrievalIds: string[] = [],
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
  }> {
    try {
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Date must be in YYYY-MM-DD format');
      }

      if (
        (!jobIds || jobIds.length === 0) &&
        (!retrievalIds || retrievalIds.length === 0)
      ) {
        throw new Error('At least one job ID or retrieval ID is required');
      }

      const result = await this.repository.createOrUpdateScheduledJob(
        date,
        jobIds || [],
        retrievalIds || [],
      );

      return {
        addedCount: result.addedJobIds.length,
        skippedCount: result.skippedJobIds.length,
        addedJobIds: result.addedJobIds,
        skippedJobIds: result.skippedJobIds,
        addedRetrievalCount: result.addedRetrievalIds.length,
        skippedRetrievalCount: result.skippedRetrievalIds.length,
        addedRetrievalIds: result.addedRetrievalIds,
        skippedRetrievalIds: result.skippedRetrievalIds,
        scheduledJob: result.scheduledJob,
      };
    } catch (error) {
      this.logger.error(
        `Error creating/updating scheduled job: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getScheduledJobByDate(date: string): Promise<ScheduledJob | null> {
    try {
      const scheduledJob = await this.repository.findScheduledJobByDate(date);
      return scheduledJob;
    } catch (error) {
      this.logger.error(
        `Error getting scheduled job by date: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAllScheduledJobs(): Promise<ScheduledJob[]> {
    try {
      const scheduledJobs = await this.repository.getAllScheduledJobs();
      return scheduledJobs;
    } catch (error) {
      this.logger.error(
        `Error getting all scheduled jobs: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getScheduledJobsByDateRange(
    startDate: string,
    endDate: string,
  ): Promise<ScheduledJob[]> {
    try {
      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        throw new Error('Start date must be in YYYY-MM-DD format');
      }

      if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new Error('End date must be in YYYY-MM-DD format');
      }

      if (startDate > endDate) {
        throw new Error('Start date must be less than or equal to end date');
      }

      const scheduledJobs =
        await this.repository.findScheduledJobsByDateRange(
          startDate,
          endDate,
        );
      return scheduledJobs;
    } catch (error) {
      this.logger.error(
        `Error getting scheduled jobs by date range: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async removeJobsFromScheduledJob(
    date: string,
    jobIds: string[],
    retrievalIds: string[] = [],
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
  }> {
    try {
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Date must be in YYYY-MM-DD format');
      }

      if (
        (!jobIds || jobIds.length === 0) &&
        (!retrievalIds || retrievalIds.length === 0)
      ) {
        throw new Error('At least one job ID or retrieval ID is required');
      }

      const result = await this.repository.removeJobsFromScheduledJob(
        date,
        jobIds || [],
        retrievalIds || [],
      );

      return {
        removedCount: result.removedJobIds.length,
        notFoundCount: result.notFoundJobIds.length,
        removedJobIds: result.removedJobIds,
        notFoundJobIds: result.notFoundJobIds,
        removedRetrievalCount: result.removedRetrievalIds.length,
        notFoundRetrievalCount: result.notFoundRetrievalIds.length,
        removedRetrievalIds: result.removedRetrievalIds,
        notFoundRetrievalIds: result.notFoundRetrievalIds,
        scheduledJob: result.scheduledJob,
      };
    } catch (error) {
      this.logger.error(
        `Error removing jobs from scheduled job: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async removeJobIdsFromAllScheduledJobs(
    jobIds: string[],
  ): Promise<{
    totalRemovedCount: number;
    notFoundCount: number;
    removedJobIds: string[];
    notFoundJobIds: string[];
    deletedScheduledJobsCount: number;
  }> {
    try {
      if (!jobIds || jobIds.length === 0) {
        throw new Error('At least one job ID is required');
      }

      const result = await this.repository.removeJobIdsFromAllScheduledJobs(
        jobIds,
      );

      return {
        totalRemovedCount: result.removedJobIds.length,
        notFoundCount: result.notFoundJobIds.length,
        removedJobIds: result.removedJobIds,
        notFoundJobIds: result.notFoundJobIds,
        deletedScheduledJobsCount: result.deletedScheduledJobsCount,
      };
    } catch (error) {
      this.logger.error(
        `Error removing job IDs from all scheduled jobs: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
