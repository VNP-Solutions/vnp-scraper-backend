import { Injectable, Logger } from '@nestjs/common';
import { Batch, Job, Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  CreateBatchDto,
  CreateJobDto,
  JobStatisticsResponseDto,
  UpdateBatchDto,
  UpdateJobDto,
} from './job.dto';
import { IJobRepository } from './job.interface';

@Injectable()
export class JobRepository implements IJobRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  async create(data: CreateJobDto): Promise<Job> {
    try {
      const { property_id, user_id, portfolio_id, sub_portfolio_id, ...rest } =
        data;

      const propertyData = await this.db.property.findFirst({
        where: {
          id: property_id,
        },
        include: {
          portfolio: true,
          subPortfolio: true,
        },
      });

      const jobData: Prisma.JobCreateInput = {
        ...rest,
        next_due_date: data.next_due_date || null,
        property_name: data.property_name,
        billing_type: data.billing_type || '',
        user: { connect: { id: user_id } },
        property: property_id ? { connect: { id: property_id } } : undefined,
        portfolio_name:
          propertyData?.portfolio?.name || data.portfolio_name || '',
        sub_portfolio_name:
          propertyData?.subPortfolio?.name || data.sub_portfolio_name || '',
        watcher_emails: data.watcher_emails || [],
        // Use portfolio_id from data if available, otherwise use from property relationship
        portfolio:
          portfolio_id || propertyData?.portfolio?.id
            ? { connect: { id: portfolio_id || propertyData?.portfolio?.id } }
            : undefined,
        subPortfolio:
          sub_portfolio_id || propertyData?.subPortfolio?.id
            ? {
                connect: {
                  id: sub_portfolio_id || propertyData?.subPortfolio?.id,
                },
              }
            : undefined,
      };

      const job = await this.db.job.create({
        data: jobData,
      });
      return job;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findById(id: string): Promise<Job> {
    try {
      const job = await this.db.job.findUnique({
        where: { id },
      });
      return job;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findAll(
    query: Record<string, any>,
  ): Promise<{ data: Job[]; metadata: any }> {
    try {
      const {
        page,
        limit,
        sortBy,
        sortOrder,
        search,
        start_date,
        end_date,
        batch_id,
        batch_name,
        ...filters
      } = query || {};
      let allFilters: any = { ...filters };

      if (search) {
        // Convert search term to string and check if it's numeric for ID searches
        const searchTerm = search.toString().trim();
        const isNumeric = !isNaN(Number(searchTerm));

        // Check if search term is a valid MongoDB ObjectId (24 character hex string)
        const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchTerm);

        allFilters.OR = [
          // Job fields - only search by ID if it's a valid ObjectId format
          ...(isValidObjectId ? [{ id: searchTerm }] : []),
          { name: { contains: searchTerm, mode: 'insensitive' } },

          // Portfolio/Sub-portfolio/Property names (existing)
          { portfolio_name: { contains: searchTerm, mode: 'insensitive' } },
          { sub_portfolio_name: { contains: searchTerm, mode: 'insensitive' } },
          { property_name: { contains: searchTerm, mode: 'insensitive' } },

          // Property IDs through relationship (only search if numeric)
          ...(isNumeric
            ? [
                { property: { expedia_id: parseInt(searchTerm) } },
                { property: { booking_id: parseInt(searchTerm) } },
                { property: { agoda_id: parseInt(searchTerm) } },
              ]
            : []),
        ];
      }

      if (start_date && end_date) {
        allFilters.createdAt = {
          gte: new Date(start_date),
          lte: new Date(end_date),
        };
      }

      if (batch_id) {
        allFilters.batch_id = batch_id;
      }

      if (batch_name) {
        allFilters.batch = {
          name: { contains: batch_name.toString().trim(), mode: 'insensitive' },
        };
      }

      const skip = page
        ? (parseInt(page || '1') - 1) * parseInt(limit || '10')
        : 0;
      const take = limit ? parseInt(limit) : 10;
      let orderBy = undefined;
      if (sortBy) {
        orderBy = {
          [sortBy]: sortOrder?.toLowerCase() === 'desc' ? 'desc' : 'asc',
        };
      }

      // Include property relationship for searching and data completeness
      const include = {
        property: {
          select: {
            id: true,
            name: true,
            expedia_id: true,
            booking_id: true,
            agoda_id: true,
          },
        },
        portfolio: {
          select: {
            id: true,
            name: true,
          },
        },
        subPortfolio: {
          select: {
            id: true,
            name: true,
          },
        },
        batch: {
          select: {
            id: true,
            name: true,
          },
        },
      };

      const totalDocuments = await this.db.job.count({
        where: allFilters,
      });

      const jobs = await this.db.job.findMany({
        where: allFilters,
        include,
        skip,
        take,
        orderBy,
      });

      const metadata = {
        totalDocuments,
        currentPage: parseInt(page),
        totalPage: Math.ceil(totalDocuments / parseInt(limit)),
        limit: parseInt(limit),
      };
      return { data: jobs, metadata };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async update(id: string, data: UpdateJobDto): Promise<Job> {
    try {
      const job = await this.db.job.update({
        where: { id },
        data,
      });
      return job;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async delete(id: string): Promise<Job> {
    try {
      const job = await this.db.job.delete({
        where: { id },
      });
      return job;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findPortfolioByName(name: string): Promise<any> {
    try {
      const portfolio = await this.db.portfolio.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      return portfolio;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findSubPortfolioByNameAndPortfolio(
    name: string,
    portfolioId: string,
  ): Promise<any> {
    try {
      const subPortfolio = await this.db.subPortfolio.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
          portfolio_id: portfolioId,
        },
      });
      return subPortfolio;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findPropertyByNameAndRelations(
    name: string,
    portfolioId?: string,
    subPortfolioId?: string,
  ): Promise<any> {
    try {
      const whereClause: any = {
        //name: { equals: name, mode: 'insensitive' },
        name: name,
      };

      if (portfolioId) {
        whereClause.portfolio_id = portfolioId;
      }

      if (subPortfolioId) {
        whereClause.sub_portfolio_id = subPortfolioId;
      }

      const property = await this.db.property.findFirst({
        where: whereClause,
      });
      return property;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findLatestCheckoutDateByJobId(
    jobId: string,
  ): Promise<{ check_out_date: Date } | null> {
    try {
      const latestJobItem = await this.db.jobItem.findFirst({
        where: {
          job_id: jobId,
        },
        orderBy: {
          check_out_date: 'desc',
        },
        select: {
          check_out_date: true,
        },
      });
      return latestJobItem;
    } catch (error) {
      this.logger.error(
        `Error finding latest checkout date for job ${jobId}:`,
        error,
      );
      throw error;
    }
  }

  async getJobStatisticsByUserId(
    userId: string,
    isAdmin: boolean,
  ): Promise<JobStatisticsResponseDto> {
    try {
      const currentCounts = await this.getJobStatusCounts(
        isAdmin ? undefined : userId,
      );
      const monthlyStats = await this.getMonthlyJobStats(
        isAdmin ? undefined : userId,
      );

      return {
        currentCounts,
        monthlyStats,
      };
    } catch (error) {
      this.logger.error(
        `Error getting job statistics for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  async getJobStatusCounts(userId?: string): Promise<{
    pending: { count: number; percentage: number };
    failed: { count: number; percentage: number };
    running: { count: number; percentage: number };
    completed: { count: number; percentage: number };
    stopped: { count: number; percentage: number };
    total: number;
  }> {
    try {
      const whereClause: any = userId ? { user_id: userId } : {};

      const [
        pendingCount,
        failedCount,
        runningCount,
        completedCount,
        stoppedCount,
        totalCount,
      ] = await Promise.all([
        this.db.job.count({
          where: { ...whereClause, job_status: 'Pending' },
        }),
        this.db.job.count({
          where: { ...whereClause, job_status: 'Failed' },
        }),
        this.db.job.count({
          where: { ...whereClause, job_status: 'Running' },
        }),
        this.db.job.count({
          where: { ...whereClause, job_status: 'Completed' },
        }),
        this.db.job.count({
          where: { ...whereClause, job_status: 'Stopped' },
        }),
        this.db.job.count({ where: whereClause }),
      ]);

      const calculatePercentage = (count: number, total: number): number => {
        return total > 0 ? Math.round((count / total) * 10000) / 100 : 0;
      };

      return {
        pending: {
          count: pendingCount,
          percentage: calculatePercentage(pendingCount, totalCount),
        },
        failed: {
          count: failedCount,
          percentage: calculatePercentage(failedCount, totalCount),
        },
        running: {
          count: runningCount,
          percentage: calculatePercentage(runningCount, totalCount),
        },
        completed: {
          count: completedCount,
          percentage: calculatePercentage(completedCount, totalCount),
        },
        stopped: {
          count: stoppedCount,
          percentage: calculatePercentage(stoppedCount, totalCount),
        },
        total: totalCount,
      };
    } catch (error) {
      this.logger.error('Error getting job status counts:', error);
      throw error;
    }
  }

  async getMonthlyJobStats(userId?: string): Promise<
    Array<{
      month: string;
      pending: { count: number; percentage: number };
      failed: { count: number; percentage: number };
      running: { count: number; percentage: number };
      completed: { count: number; percentage: number };
      stopped: { count: number; percentage: number };
      total: number;
    }>
  > {
    try {
      const now = new Date();
      const twelveMonthsAgo = new Date(
        now.getFullYear(),
        now.getMonth() - 11,
        1,
      );

      const whereClause: any = {
        createdAt: {
          gte: twelveMonthsAgo,
        },
      };

      if (userId) {
        whereClause.user_id = userId;
      }

      // Get all jobs from the last 12 months
      const jobs = await this.db.job.findMany({
        where: whereClause,
        select: {
          job_status: true,
          createdAt: true,
        },
      });

      // Create a map for the last 12 months
      const monthlyStats = new Map<
        string,
        {
          month: string;
          pending: number;
          failed: number;
          running: number;
          completed: number;
          stopped: number;
          total: number;
        }
      >();

      // Initialize all months with zero counts
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        monthlyStats.set(monthKey, {
          month: monthKey,
          pending: 0,
          failed: 0,
          running: 0,
          completed: 0,
          stopped: 0,
          total: 0,
        });
      }

      // Count jobs by month and status
      jobs.forEach((job) => {
        const jobDate = new Date(job.createdAt);
        const monthKey = `${jobDate.getFullYear()}-${(jobDate.getMonth() + 1).toString().padStart(2, '0')}`;

        const monthData = monthlyStats.get(monthKey);
        if (monthData) {
          monthData.total++;
          switch (job.job_status) {
            case 'Pending':
              monthData.pending++;
              break;
            case 'Failed':
              monthData.failed++;
              break;
            case 'Running':
              monthData.running++;
              break;
            case 'Completed':
              monthData.completed++;
              break;
            case 'Stopped':
              monthData.stopped++;
              break;
          }
        }
      });

      const calculatePercentage = (count: number, total: number): number => {
        return total > 0 ? Math.round((count / total) * 10000) / 100 : 0;
      };

      return Array.from(monthlyStats.values()).map((monthData) => ({
        month: monthData.month,
        pending: {
          count: monthData.pending,
          percentage: calculatePercentage(monthData.pending, monthData.total),
        },
        failed: {
          count: monthData.failed,
          percentage: calculatePercentage(monthData.failed, monthData.total),
        },
        running: {
          count: monthData.running,
          percentage: calculatePercentage(monthData.running, monthData.total),
        },
        completed: {
          count: monthData.completed,
          percentage: calculatePercentage(monthData.completed, monthData.total),
        },
        stopped: {
          count: monthData.stopped,
          percentage: calculatePercentage(monthData.stopped, monthData.total),
        },
        total: monthData.total,
      }));
    } catch (error) {
      this.logger.error('Error getting monthly job statistics:', error);
      throw error;
    }
  }

  // Batch repository methods
  async createBatch(data: CreateBatchDto): Promise<Batch> {
    try {
      const batch = await this.db.batch.create({
        data: {
          name: data.name,
        },
        include: {
          jobs: {
            select: {
              id: true,
              name: true,
              job_status: true,
              property_name: true,
              ota_provider: true,
              createdAt: true,
            },
          },
        },
      });
      return batch as Batch;
    } catch (error) {
      this.logger.error('Error creating batch:', error);
      throw error;
    }
  }

  async findBatchById(id: string): Promise<Batch> {
    try {
      const batch = await this.db.batch.findUnique({
        where: { id },
        include: {
          jobs: {
            select: {
              id: true,
              name: true,
              job_status: true,
              property_name: true,
              ota_provider: true,
              createdAt: true,
            },
          },
        },
      });

      if (!batch) {
        throw new Error(`Batch with ID ${id} not found`);
      }

      return batch as Batch;
    } catch (error) {
      this.logger.error('Error finding batch by ID:', error);
      throw error;
    }
  }

  async findAllBatches(query: Record<string, any>): Promise<Batch[]> {
    try {
      const { search } = query || {};

      let whereClause: any = {};

      if (search) {
        const searchTerm = search.toString().trim();
        const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchTerm);

        if (isValidObjectId) {
          whereClause.OR = [
            { id: searchTerm },
            { name: { contains: searchTerm, mode: 'insensitive' } },
          ];
        } else {
          whereClause.name = { contains: searchTerm, mode: 'insensitive' };
        }
      }

      const batches = await this.db.batch.findMany({
        where: whereClause,
        include: {
          jobs: {
            select: {
              id: true,
              name: true,
              job_status: true,
              property_name: true,
              ota_provider: true,
              createdAt: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return batches;
    } catch (error) {
      this.logger.error('Error finding all batches:', error);
      throw error;
    }
  }

  async updateBatch(id: string, data: UpdateBatchDto): Promise<Batch> {
    try {
      const batch = await this.db.batch.update({
        where: { id },
        data: {
          name: data.name,
        },
        include: {
          jobs: {
            select: {
              id: true,
              name: true,
              job_status: true,
              property_name: true,
              ota_provider: true,
              createdAt: true,
            },
          },
        },
      });

      return batch as Batch;
    } catch (error) {
      this.logger.error('Error updating batch:', error);
      throw error;
    }
  }

  async deleteBatch(id: string): Promise<Batch> {
    try {
      // First get the batch to return it after deletion
      const batchToDelete = await this.db.batch.findUnique({
        where: { id },
        include: {
          jobs: {
            select: {
              id: true,
              name: true,
              job_status: true,
              property_name: true,
              ota_provider: true,
              createdAt: true,
            },
          },
        },
      });

      if (!batchToDelete) {
        throw new Error(`Batch with ID ${id} not found`);
      }

      // First, update all jobs to remove the batch_id reference
      await this.db.job.updateMany({
        where: { batch_id: id },
        data: { batch_id: null },
      });

      // Then delete the batch
      await this.db.batch.delete({
        where: { id },
      });

      return batchToDelete as Batch;
    } catch (error) {
      this.logger.error('Error deleting batch:', error);
      throw error;
    }
  }
}
