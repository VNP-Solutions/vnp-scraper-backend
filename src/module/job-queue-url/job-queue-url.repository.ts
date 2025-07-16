import { Injectable, Logger } from '@nestjs/common';
import { JobQueueUrlStatus } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  CreateJobQueueUrlData,
  IJobQueueUrl,
  IJobQueueUrlRepository,
  UpdateJobQueueUrlData,
} from './job-queue-url.interface';

@Injectable()
export class JobQueueUrlRepository implements IJobQueueUrlRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  get databaseService(): DatabaseService {
    return this.db;
  }

  async create(data: CreateJobQueueUrlData): Promise<IJobQueueUrl> {
    try {
      const jobQueueUrl = await this.db.jobQueueUrl.create({
        data: {
          name: data.name,
          url: data.url,
          description: data.description,
          priority: data.priority || 1,
          max_concurrent_jobs: data.max_concurrent_jobs || 1,
          is_active: data.is_active !== undefined ? data.is_active : true,
        },
      });
      return jobQueueUrl;
    } catch (error: any) {
      this.logger.error(
        `Error creating job queue URL: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  async findById(id: string): Promise<IJobQueueUrl | null> {
    try {
      return await this.db.jobQueueUrl.findUnique({
        where: { id },
      });
    } catch (error: any) {
      this.logger.error(
        `Error finding job queue URL by ID ${id}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  async findAll(): Promise<IJobQueueUrl[]> {
    try {
      return await this.db.jobQueueUrl.findMany({
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
    } catch (error: any) {
      this.logger.error(
        `Error finding all job queue URLs: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  async findAvailableUrls(): Promise<IJobQueueUrl[]> {
    try {
      return await this.db.jobQueueUrl.findMany({
        where: {
          status: JobQueueUrlStatus.Available,
          is_active: true,
        },
        orderBy: [{ priority: 'desc' }, { last_used: 'asc' }],
      });
    } catch (error: any) {
      this.logger.error(
        `Error finding available job queue URLs: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  async update(id: string, data: UpdateJobQueueUrlData): Promise<IJobQueueUrl> {
    try {
      return await this.db.jobQueueUrl.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.url && { url: data.url }),
          ...(data.status && { status: data.status }),
          ...(data.description !== undefined && {
            description: data.description,
          }),
          ...(data.priority && { priority: data.priority }),
          ...(data.max_concurrent_jobs && {
            max_concurrent_jobs: data.max_concurrent_jobs,
          }),
          ...(data.is_active !== undefined && { is_active: data.is_active }),
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Error updating job queue URL ${id}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.jobQueueUrl.delete({
        where: { id },
      });
    } catch (error: any) {
      this.logger.error(
        `Error deleting job queue URL ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findByUrl(url: string): Promise<IJobQueueUrl | null> {
    try {
      return await this.db.jobQueueUrl.findUnique({
        where: { url },
      });
    } catch (error: any) {
      this.logger.error(
        `Error finding job queue URL by URL ${url}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  async findAvailableUrlForBooking(): Promise<IJobQueueUrl | null> {
    try {
      // Find the best available URL based on priority and last used time
      const availableUrls = await this.db.jobQueueUrl.findMany({
        where: {
          status: JobQueueUrlStatus.Available,
          is_active: true,
        },
        orderBy: [{ priority: 'desc' }, { last_used: 'asc' }],
      });

      // Skip job count capacity check as requested - just return first available URL
      return availableUrls.length > 0 ? availableUrls[0] : null;
    } catch (error: any) {
      this.logger.error(
        `Error finding available URL for booking: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  async bookUrl(id: string, jobId: string): Promise<IJobQueueUrl> {
    try {
      return await this.db.jobQueueUrl.update({
        where: { id },
        data: {
          status: JobQueueUrlStatus.Booked,
          assigned_to_job_id: jobId,
          // current_job_count: {
          //   increment: 1,
          // },
          last_used: new Date(),
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Error booking job queue URL ${id} for job ${jobId}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  async releaseUrl(id: string): Promise<IJobQueueUrl> {
    try {
      const currentUrl = await this.findById(id);
      if (!currentUrl) {
        throw new Error('URL not found');
      }

      return await this.db.jobQueueUrl.update({
        where: { id },
        data: {
          status: JobQueueUrlStatus.Available,
          assigned_to_job_id: null,
          // current_job_count: Math.max(0, currentUrl.current_job_count - 1),
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Error releasing job queue URL ${id}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  async findByStatus(status: JobQueueUrlStatus): Promise<IJobQueueUrl[]> {
    try {
      return await this.db.jobQueueUrl.findMany({
        where: { status },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
    } catch (error: any) {
      this.logger.error(
        `Error finding job queue URLs by status ${status}: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }
}
