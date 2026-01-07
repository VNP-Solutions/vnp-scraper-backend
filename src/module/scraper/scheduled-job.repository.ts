import { Injectable, Logger } from '@nestjs/common';
import { ScheduledJob } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { IScheduledJobRepository } from './scheduled-job.interface';

@Injectable()
export class ScheduledJobRepository implements IScheduledJobRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  async createOrUpdateScheduledJob(
    date: string,
    jobIds: string[],
    retrievalIds: string[] = [],
  ): Promise<{
    scheduledJob: ScheduledJob;
    addedJobIds: string[];
    skippedJobIds: string[];
    addedRetrievalIds: string[];
    skippedRetrievalIds: string[];
  }> {
    try {
      // Find existing scheduled job for this date
      const existingScheduledJob = await this.db.scheduledJob.findFirst({
        where: { date },
      });

      let addedJobIds: string[] = [];
      let skippedJobIds: string[] = [];
      let addedRetrievalIds: string[] = [];
      let skippedRetrievalIds: string[] = [];

      if (existingScheduledJob) {
        // Update existing scheduled job - add new job IDs that don't exist
        const existingJobIds = existingScheduledJob.job_ids || [];
        const newJobIds = jobIds.filter((id) => !existingJobIds.includes(id));
        skippedJobIds = jobIds.filter((id) => existingJobIds.includes(id));
        addedJobIds = newJobIds;

        const updatedJobIds = [...existingJobIds, ...newJobIds];

        // Handle retrieval IDs
        const existingRetrievalIds = existingScheduledJob.retrieval_ids || [];
        const newRetrievalIds = retrievalIds.filter(
          (id) => !existingRetrievalIds.includes(id),
        );
        skippedRetrievalIds = retrievalIds.filter((id) =>
          existingRetrievalIds.includes(id),
        );
        addedRetrievalIds = newRetrievalIds;

        const updatedRetrievalIds = [
          ...existingRetrievalIds,
          ...newRetrievalIds,
        ];

        const scheduledJob = await this.db.scheduledJob.update({
          where: { id: existingScheduledJob.id },
          data: {
            job_ids: updatedJobIds,
            retrieval_ids: updatedRetrievalIds,
          },
        });

        return {
          scheduledJob,
          addedJobIds,
          skippedJobIds,
          addedRetrievalIds,
          skippedRetrievalIds,
        };
      } else {
        // Create new scheduled job
        const scheduledJob = await this.db.scheduledJob.create({
          data: {
            date,
            job_ids: jobIds,
            retrieval_ids: retrievalIds,
          },
        });

        addedJobIds = jobIds;
        addedRetrievalIds = retrievalIds;

        return {
          scheduledJob,
          addedJobIds,
          skippedJobIds,
          addedRetrievalIds,
          skippedRetrievalIds,
        };
      }
    } catch (error) {
      this.logger.error(
        `Error creating/updating scheduled job: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findScheduledJobByDate(date: string): Promise<ScheduledJob | null> {
    try {
      const scheduledJob = await this.db.scheduledJob.findFirst({
        where: { date },
      });
      return scheduledJob;
    } catch (error) {
      this.logger.error(
        `Error finding scheduled job by date: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findScheduledJobsForDate(date: string): Promise<ScheduledJob[]> {
    try {
      const scheduledJobs = await this.db.scheduledJob.findMany({
        where: { date },
      });
      return scheduledJobs;
    } catch (error) {
      this.logger.error(
        `Error finding scheduled jobs for date: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAllScheduledJobs(): Promise<ScheduledJob[]> {
    try {
      const scheduledJobs = await this.db.scheduledJob.findMany({
        orderBy: { date: 'asc' },
      });
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
