import { Inject, Injectable, Logger } from '@nestjs/common';
import { ScheduledJob } from '@prisma/client';
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
}
