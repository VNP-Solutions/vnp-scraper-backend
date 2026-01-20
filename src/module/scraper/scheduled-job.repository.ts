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

  async findScheduledJobsByDateRange(
    startDate: string,
    endDate: string,
  ): Promise<ScheduledJob[]> {
    try {
      const scheduledJobs = await this.db.scheduledJob.findMany({
        where: {
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { date: 'asc' },
      });
      return scheduledJobs;
    } catch (error) {
      this.logger.error(
        `Error finding scheduled jobs by date range: ${error.message}`,
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
    scheduledJob: ScheduledJob | null;
    removedJobIds: string[];
    notFoundJobIds: string[];
    removedRetrievalIds: string[];
    notFoundRetrievalIds: string[];
  }> {
    try {
      const existingScheduledJob = await this.db.scheduledJob.findFirst({
        where: { date },
      });

      if (!existingScheduledJob) {
        return {
          scheduledJob: null,
          removedJobIds: [],
          notFoundJobIds: jobIds,
          removedRetrievalIds: [],
          notFoundRetrievalIds: retrievalIds,
        };
      }

      const existingJobIds = existingScheduledJob.job_ids || [];
      const existingRetrievalIds = existingScheduledJob.retrieval_ids || [];

      const removedJobIds = jobIds.filter((id) => existingJobIds.includes(id));
      const notFoundJobIds = jobIds.filter((id) => !existingJobIds.includes(id));

      const removedRetrievalIds = retrievalIds.filter((id) =>
        existingRetrievalIds.includes(id),
      );
      const notFoundRetrievalIds = retrievalIds.filter(
        (id) => !existingRetrievalIds.includes(id),
      );

      const updatedJobIds = existingJobIds.filter(
        (id) => !jobIds.includes(id),
      );
      const updatedRetrievalIds = existingRetrievalIds.filter(
        (id) => !retrievalIds.includes(id),
      );

      // Update removed jobs' schedule_date to null
      if (removedJobIds.length > 0) {
        await this.db.job.updateMany({
          where: {
            id: {
              in: removedJobIds,
            },
          },
          data: {
            schedule_date: null,
          } as any,
        });
        this.logger.log(
          `Set schedule_date to null for ${removedJobIds.length} job(s)`,
        );
      }

      let scheduledJob: ScheduledJob | null;

      if (
        updatedJobIds.length === 0 &&
        updatedRetrievalIds.length === 0
      ) {
        await this.db.scheduledJob.delete({
          where: { id: existingScheduledJob.id },
        });
        scheduledJob = null;
      } else {
        scheduledJob = await this.db.scheduledJob.update({
          where: { id: existingScheduledJob.id },
          data: {
            job_ids: updatedJobIds,
            retrieval_ids: updatedRetrievalIds,
          },
        });
      }

      return {
        scheduledJob,
        removedJobIds,
        notFoundJobIds,
        removedRetrievalIds,
        notFoundRetrievalIds,
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
    removedJobIds: string[];
    notFoundJobIds: string[];
    deletedScheduledJobsCount: number;
  }> {
    try {
      // Find all scheduled jobs that contain any of the provided job IDs
      const allScheduledJobs = await this.db.scheduledJob.findMany({
        where: {
          job_ids: {
            hasSome: jobIds,
          },
        },
      });

      const removedJobIdsSet = new Set<string>();
      const notFoundJobIdsSet = new Set<string>(jobIds);
      let deletedScheduledJobsCount = 0;

      // Process each scheduled job
      for (const scheduledJob of allScheduledJobs) {
        const existingJobIds = scheduledJob.job_ids || [];
        const jobsToRemove = jobIds.filter((id) => existingJobIds.includes(id));

        // Track removed job IDs
        jobsToRemove.forEach((id) => {
          removedJobIdsSet.add(id);
          notFoundJobIdsSet.delete(id);
        });

        // Remove the job IDs from this scheduled job
        const updatedJobIds = existingJobIds.filter(
          (id) => !jobIds.includes(id),
        );

        // If the scheduled job becomes empty, delete it
        if (
          updatedJobIds.length === 0 &&
          (!scheduledJob.retrieval_ids ||
            scheduledJob.retrieval_ids.length === 0)
        ) {
          await this.db.scheduledJob.delete({
            where: { id: scheduledJob.id },
          });
          deletedScheduledJobsCount++;
        } else {
          // Update the scheduled job with remaining job IDs
          await this.db.scheduledJob.update({
            where: { id: scheduledJob.id },
            data: {
              job_ids: updatedJobIds,
            },
          });
        }
      }

      // Update removed jobs' schedule_date to null
      if (removedJobIdsSet.size > 0) {
        const removedJobIdsArray = Array.from(removedJobIdsSet);
        await this.db.job.updateMany({
          where: {
            id: {
              in: removedJobIdsArray,
            },
          },
          data: {
            schedule_date: null,
          } as any,
        });
        this.logger.log(
          `Set schedule_date to null for ${removedJobIdsArray.length} job(s)`,
        );
      }

      return {
        removedJobIds: Array.from(removedJobIdsSet),
        notFoundJobIds: Array.from(notFoundJobIdsSet),
        deletedScheduledJobsCount,
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
