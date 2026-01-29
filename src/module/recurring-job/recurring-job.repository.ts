import { Injectable, Logger } from '@nestjs/common';
import { Job, Prisma, RecurringJob } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { IRecurringJobRepository } from './recurring-job.interface';

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
  ): Promise<(RecurringJob & { jobs: Job[] }) | null> {
    try {
      const recurringJob = await this.db.recurringJob.findUnique({
        where: { id },
        include: {
          jobs: {
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });
      return recurringJob;
    } catch (error) {
      this.logger.error('Error finding recurring job with jobs:', error);
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
        ...filters
      } = query || {};

      const skip = (page - 1) * limit;
      const allFilters: any = { ...filters };

      // Search filter
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

  async delete(id: string): Promise<RecurringJob> {
    try {
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
}
