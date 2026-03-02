import { Injectable, Logger } from '@nestjs/common';
import { Job, Prisma, RecurringJob, RecurringReportBucket } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  IRecurringJobRepository,
  RecurringJobWithBucketsAndJobs,
} from './recurring-job.interface';

@Injectable()
export class RecurringJobRepository implements IRecurringJobRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  async create(data: any): Promise<RecurringJob> {
    try {
      const recurringJobData: Prisma.RecurringJobCreateInput = {
        name: data.name,
        schedule_date: data.schedule_date,
        next_date: data.next_date ?? null,
        ota_provider: data.ota_provider,
        duration: data.duration ?? 1,
        is_active: data.is_active ?? true,
      };

      const recurringJob = await this.db.recurringJob.create({
        data: recurringJobData,
      });

      return recurringJob;
    } catch (error) {
      this.logger.error('Error creating recurring job:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<RecurringJob | null> {
    try {
      const recurringJob = await this.db.recurringJob.findUnique({
        where: { id },
      });
      return recurringJob;
    } catch (error) {
      this.logger.error('Error finding recurring job by id:', error);
      throw error;
    }
  }

  async findByIdWithJobs(
    id: string,
  ): Promise<RecurringJobWithBucketsAndJobs | null> {
    try {
      const recurringJob = await this.db.recurringJob.findUnique({
        where: { id },
        include: {
          buckets: {
            orderBy: {
              bucket_number: 'asc',
            },
            include: {
              jobs: {
                orderBy: {
                  createdAt: 'asc',
                },
              },
            },
          },
          jobs: {
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });
      return recurringJob;
    } catch (error) {
      this.logger.error('Error finding recurring job with buckets and jobs:', error);
      throw error;
    }
  }

  async findAll(query: Record<string, any>): Promise<{
    data: RecurringJob[];
    metadata: any;
  }> {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        search,
        is_active,
        duration,
        portfolio_id,
        property_id,
        ota_provider,
        ...filters
      } = query || {};

      const skip = (page - 1) * limit;
      const allFilters: any = { ...filters };

      // Search filter - searches in recurring job name
      if (search) {
        const searchTerm = search.toString().trim();
        const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchTerm);

        allFilters.OR = [
          ...(isValidObjectId ? [{ id: searchTerm }] : []),
          { name: { contains: searchTerm, mode: 'insensitive' } },
        ];
      }

      // Active status filter
      if (is_active !== undefined && is_active !== null) {
        if (is_active === 'true' || is_active === true) {
          allFilters.is_active = true;
        } else if (is_active === 'false' || is_active === false) {
          allFilters.is_active = false;
        }
      }

      // Duration filter
      if (duration !== undefined && duration !== null) {
        allFilters.duration = parseInt(duration.toString());
      }

      // Portfolio filter - search in jobs
      if (portfolio_id) {
        allFilters.jobs = {
          some: {
            portfolio_id: portfolio_id.toString(),
          },
        };
      }

      // Property filter - search in jobs
      if (property_id) {
        if (allFilters.jobs) {
          allFilters.jobs.some.property_id = property_id.toString();
        } else {
          allFilters.jobs = {
            some: {
              property_id: property_id.toString(),
            },
          };
        }
      }

      // OTA Provider filter - search in jobs
      if (ota_provider) {
        if (allFilters.jobs) {
          allFilters.jobs.some.ota_provider = ota_provider.toString();
        } else {
          allFilters.jobs = {
            some: {
              ota_provider: ota_provider.toString(),
            },
          };
        }
      }

      // Get total count
      const total = await this.db.recurringJob.count({
        where: allFilters,
      });

      // Get paginated data
      const data = await this.db.recurringJob.findMany({
        where: allFilters,
        skip: skip,
        take: parseInt(limit.toString()),
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          _count: {
            select: {
              buckets: true,
              jobs: true,
            },
          },
        },
      });

      const totalPages = Math.ceil(total / limit);

      return {
        data,
        metadata: {
          total,
          page: parseInt(page.toString()),
          limit: parseInt(limit.toString()),
          totalPages,
        },
      };
    } catch (error) {
      this.logger.error('Error finding all recurring jobs:', error);
      throw error;
    }
  }

  async update(id: string, data: any): Promise<RecurringJob> {
    try {
      const updateData: Prisma.RecurringJobUpdateInput = {};

      if (data.name !== undefined) {
        updateData.name = data.name;
      }

      if (data.schedule_date !== undefined) {
        updateData.schedule_date = data.schedule_date;
      }

      if (data.duration !== undefined) {
        updateData.duration = data.duration;
      }

      if (data.next_date !== undefined) {
        updateData.next_date = data.next_date;
      }

      if (data.is_active !== undefined) {
        updateData.is_active = data.is_active;
      }

      const recurringJob = await this.db.recurringJob.update({
        where: { id },
        data: updateData,
      });

      return recurringJob;
    } catch (error) {
      this.logger.error('Error updating recurring job:', error);
      throw error;
    }
  }

  async findByName(name: string): Promise<RecurringJob | null> {
    try {
      const recurringJob = await this.db.recurringJob.findFirst({
        where: { name },
      });
      return recurringJob;
    } catch (error) {
      this.logger.error('Error finding recurring job by name:', error);
      throw error;
    }
  }

  async delete(id: string): Promise<RecurringJob> {
    try {
      // Delete all buckets first (cascade handles job disconnection)
      await this.db.recurringReportBucket.deleteMany({
        where: { recurring_id: id },
      });

      const recurringJob = await this.db.recurringJob.delete({
        where: { id },
      });
      return recurringJob;
    } catch (error) {
      this.logger.error('Error deleting recurring job:', error);
      throw error;
    }
  }

  async findJobsByRecurringId(recurringId: string): Promise<Job[]> {
    try {
      const jobs = await this.db.job.findMany({
        where: {
          recurring_id: recurringId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      return jobs;
    } catch (error) {
      this.logger.error('Error finding jobs by recurring id:', error);
      throw error;
    }
  }

  // --- Bucket methods ---

  async createBucket(data: {
    recurring_id: string;
    bucket_number: number;
    name: string;
  }): Promise<RecurringReportBucket> {
    try {
      const bucket = await this.db.recurringReportBucket.create({
        data: {
          recurring_id: data.recurring_id,
          bucket_number: data.bucket_number,
          name: data.name,
        },
      });
      return bucket;
    } catch (error) {
      this.logger.error('Error creating recurring report bucket:', error);
      throw error;
    }
  }

  async findBucketById(id: string): Promise<RecurringReportBucket | null> {
    try {
      const bucket = await this.db.recurringReportBucket.findUnique({
        where: { id },
      });
      return bucket;
    } catch (error) {
      this.logger.error('Error finding bucket by id:', error);
      throw error;
    }
  }

  async findBucketsByRecurringId(
    recurringId: string,
  ): Promise<(RecurringReportBucket & { jobs: Job[] })[]> {
    try {
      const buckets = await this.db.recurringReportBucket.findMany({
        where: { recurring_id: recurringId },
        orderBy: { bucket_number: 'asc' },
        include: {
          jobs: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      return buckets;
    } catch (error) {
      this.logger.error('Error finding buckets by recurring id:', error);
      throw error;
    }
  }

  async findLatestBucketByRecurringId(
    recurringId: string,
  ): Promise<(RecurringReportBucket & { jobs: Job[] }) | null> {
    try {
      const bucket = await this.db.recurringReportBucket.findFirst({
        where: { recurring_id: recurringId },
        orderBy: { bucket_number: 'desc' },
        include: {
          jobs: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      return bucket;
    } catch (error) {
      this.logger.error('Error finding latest bucket:', error);
      throw error;
    }
  }

  async countJobsInBucket(bucketId: string): Promise<number> {
    try {
      const count = await this.db.job.count({
        where: { recurring_report_bucket_id: bucketId },
      });
      return count;
    } catch (error) {
      this.logger.error('Error counting jobs in bucket:', error);
      throw error;
    }
  }
}
