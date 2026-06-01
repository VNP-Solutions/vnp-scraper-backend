import { Injectable, Logger } from '@nestjs/common';
import { Batch, DbEntry, Job, Prisma } from '@prisma/client';
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
      const {
        property_id,
        user_id,
        portfolio_id,
        sub_portfolio_id,
        batch_id,
        recurring_id,
        recurring_report_bucket_id,
        ...rest
      } = data;

      let propertyData = null;
      if (property_id) {
        propertyData = await this.db.property.findFirst({
          where: {
            id: property_id,
          },
          include: {
            portfolio: true,
            subPortfolio: true,
          },
        });
      }

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
        batch: batch_id ? { connect: { id: batch_id } } : undefined,
        ...(recurring_id
          ? { recurringJob: { connect: { id: recurring_id } } }
          : {}),
        ...(recurring_report_bucket_id
          ? { recurringReportBucket: { connect: { id: recurring_report_bucket_id } } }
          : {}),
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
  ): Promise<{ data: any[]; metadata: any }> {
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
        is_archived,
        is_quick_job,
        filter_invoice_amount,
        job_type,
        schedule_start_date,
        schedule_end_date,
        recurring_id,
        recurring_report_bucket_id,
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
          // Job id or linked property document id (Mongo ObjectId)
          ...(isValidObjectId
            ? [{ id: searchTerm }, { property_id: searchTerm }]
            : []),
          { name: { contains: searchTerm, mode: 'insensitive' } },

          // Portfolio/Sub-portfolio/Property names (existing)
          { portfolio_name: { contains: searchTerm, mode: 'insensitive' } },
          { sub_portfolio_name: { contains: searchTerm, mode: 'insensitive' } },
          { property_name: { contains: searchTerm, mode: 'insensitive' } },

          // Batch name search through relationship
          { batch: { name: { contains: searchTerm, mode: 'insensitive' } } },

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

      // Handle is_archived filter (after search to properly merge OR conditions)
      if (is_archived !== undefined && is_archived !== null) {
        if (is_archived === 'true' || is_archived === true) {
          allFilters.is_archived = true;
        } else if (is_archived === 'false' || is_archived === false) {
          // Include records where is_archived is false OR null/undefined (legacy data)
          allFilters.is_archived = false;
        }
      }

      if (is_quick_job !== undefined && is_quick_job !== null && is_quick_job !== '') {
        if (is_quick_job === 'true' || is_quick_job === true) {
          allFilters.is_quick_job = true;
        } else if (is_quick_job === 'false' || is_quick_job === false) {
          allFilters.is_quick_job = false;
        }
      }

      // Handle job_type and schedule_date filters
      const jobTypeLower = job_type ? job_type.toString().toLowerCase() : null;

      if (jobTypeLower === 'manual') {
        // Manual jobs: schedule_date must be null or missing
        // In Prisma with MongoDB, for optional String? fields, null should match both:
        // 1. Documents where schedule_date is explicitly null
        // 2. Documents where schedule_date field doesn't exist (undefined)
        // However, if Prisma's null check doesn't work for missing fields, we need a workaround
        // The workaround: Don't filter by schedule_date in the query, then filter results in memory
        // But that's inefficient. Instead, we'll try using null which should work for optional fields
        // If this still doesn't work, the issue might be with how Prisma handles null for optional fields
        // Setting schedule_date to null should match both null and missing values for optional fields
        // allFilters.schedule_date = null;
        allFilters = {
          ...allFilters,
          OR: [{ schedule_date: null }, { schedule_date: { isSet: false } }],
        };
      } else if (jobTypeLower === 'scheduled') {
        // Scheduled jobs: schedule_date must not be null
        // Then apply date range if provided
        if (schedule_start_date || schedule_end_date) {
          const scheduleDateFilter: any = {
            not: null,
          };

          if (schedule_start_date && schedule_end_date) {
            scheduleDateFilter.gte = schedule_start_date;
            scheduleDateFilter.lte = schedule_end_date;
          } else if (schedule_start_date) {
            scheduleDateFilter.gte = schedule_start_date;
          } else if (schedule_end_date) {
            scheduleDateFilter.lte = schedule_end_date;
          }

          allFilters.schedule_date = scheduleDateFilter;
        } else {
          allFilters.schedule_date = {
            not: null,
          };
        }
      } else {
        // job_type is 'All' or not provided - no job_type filter
        // But can still apply schedule_date range filter
        if (schedule_start_date || schedule_end_date) {
          const scheduleDateFilter: any = {};

          if (schedule_start_date && schedule_end_date) {
            scheduleDateFilter.gte = schedule_start_date;
            scheduleDateFilter.lte = schedule_end_date;
          } else if (schedule_start_date) {
            scheduleDateFilter.gte = schedule_start_date;
          } else if (schedule_end_date) {
            scheduleDateFilter.lte = schedule_end_date;
          }

          allFilters.schedule_date = scheduleDateFilter;
        }
      }

      // Filter by recurring_id
      if (recurring_id) {
        allFilters.recurring_id = recurring_id.toString();
      }

      // Filter by recurring_report_bucket_id
      if (recurring_report_bucket_id) {
        allFilters.recurring_report_bucket_id = recurring_report_bucket_id.toString();
      }

      let orderBy = undefined;
      if (sortBy) {
        orderBy = {
          [sortBy]: sortOrder?.toLowerCase() === 'desc' ? 'desc' : 'asc',
        };
      }

      const jobListSelect = {
        id: true,
        ota_provider: true,
        property_id: true,
        property_name: true,
        job_status: true,
        is_quick_job: true,
        otp_needed: true,
        otp_fulfilled: true,
        billing_type: true,
        screenshot_urls: true,
        property: {
          select: {
            id: true,
            portfolio_id: true,
            sub_portfolio_id: true,
            name: true,
            expedia_id: true,
            expedia_status: true,
            booking_id: true,
            booking_status: true,
            agoda_id: true,
            agoda_status: true,
            createdAt: true,
            updatedAt: true,
            booking_trusted_status: true,
            booking_last_login: true,
            phone_number: true,
            slot: true,
            phone_number_slot_id: true,
            portfolio: { select: { id: true, name: true } },
            subPortfolio: { select: { id: true, name: true } },
          },
        },
      } as Prisma.JobSelect;

      // If filter_invoice_amount is true, we need to fetch all jobs first to calculate total count
      // Otherwise, we can use the count query for better performance
      const needsInvoiceFilter =
        filter_invoice_amount === 'true' || filter_invoice_amount === true;

      if (needsInvoiceFilter) {
        // Fetch all jobs matching filters (without pagination) to calculate invoice amounts and get accurate total count
        const allJobs = await this.db.job.findMany({
          where: allFilters,
          select: jobListSelect,
          orderBy,
        });

        // Get all job IDs with billing_type === 'DB'
        const allDbJobIds = allJobs
          .filter((job) => job.billing_type === 'DB')
          .map((job) => job.id);

        // Fetch all DbData records for DB billing type jobs
        let allTotalInvoiceAmountMap = new Map<string, number>();

        if (allDbJobIds.length > 0) {
          const allDbDataRecords = await this.db.dbData.findMany({
            where: {
              job_id: { in: allDbJobIds },
            },
            select: {
              job_id: true,
              total_invoice_amount: true,
            },
          });

          // Group by job_id and calculate sums
          for (const dbData of allDbDataRecords) {
            const currentSum = allTotalInvoiceAmountMap.get(dbData.job_id) || 0;
            const amount = dbData.total_invoice_amount || 0;
            allTotalInvoiceAmountMap.set(dbData.job_id, currentSum + amount);
          }
        }

        // Add total invoice amount field to all jobs with billing_type === 'DB'
        const allJobsWithTotalInvoiceAmount = allJobs.map((job) => {
          const jobData = job as any;

          if (job.billing_type === 'DB') {
            const totalInvoiceAmount =
              allTotalInvoiceAmountMap.get(job.id) || 0;
            jobData.total_invoice_amount =
              Math.round(totalInvoiceAmount * 100) / 100;
          }

          return jobData;
        });

        // Filter jobs to only return those with total_invoice_amount > 0
        const filteredAllJobs = allJobsWithTotalInvoiceAmount.filter((job) => {
          return job.total_invoice_amount > 0;
        });

        // Get total count after filtering
        const totalDocuments = filteredAllJobs.length;

        // Apply pagination to filtered results
        const skip = page
          ? (parseInt(page || '1') - 1) * parseInt(limit || '10')
          : 0;
        const take = limit ? parseInt(limit) : 10;
        const jobs = filteredAllJobs.slice(skip, skip + take);

        const statusCounts = { pending: 0, failed: 0, completed: 0 };
        for (const j of filteredAllJobs) {
          if (j.job_status === 'Pending') statusCounts.pending += 1;
          else if (j.job_status === 'Failed') statusCounts.failed += 1;
          else if (j.job_status === 'Completed') statusCounts.completed += 1;
        }

        const metadata = {
          totalDocuments,
          currentPage: parseInt(page || '1'),
          totalPage: Math.ceil(totalDocuments / parseInt(limit || '10')),
          limit: parseInt(limit || '10'),
          statusCounts,
        };
        return { data: jobs, metadata };
      }

      // Normal flow: use count query for better performance
      const skip = page
        ? (parseInt(page || '1') - 1) * parseInt(limit || '10')
        : 0;
      const take = limit ? parseInt(limit) : 10;

      const [totalDocuments, jobs, statusGroups] = await Promise.all([
        this.db.job.count({
          where: allFilters,
        }),
        this.db.job.findMany({
          where: allFilters,
          select: jobListSelect,
          skip,
          take,
          orderBy,
        }),
        this.db.job.groupBy({
          by: ['job_status'],
          where: allFilters,
          _count: { _all: true },
        }),
      ]);

      const statusCounts = { pending: 0, failed: 0, completed: 0 };
      for (const row of statusGroups) {
        if (row.job_status === 'Pending') {
          statusCounts.pending = row._count._all;
        } else if (row.job_status === 'Failed') {
          statusCounts.failed = row._count._all;
        } else if (row.job_status === 'Completed') {
          statusCounts.completed = row._count._all;
        }
      }

      const metadata = {
        totalDocuments,
        currentPage: parseInt(page || '1'),
        totalPage: Math.ceil(totalDocuments / parseInt(limit || '10')),
        limit: parseInt(limit || '10'),
        statusCounts,
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
      // First, delete all associated job items
      await this.db.jobItem.deleteMany({
        where: { job_id: id },
      });

      // Delete all associated db data
      await this.db.dbData.deleteMany({
        where: { job_id: id },
      });

      // Then delete the job
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
        // where: { name: { equals: name, mode: 'insensitive' } },
        where: { name: name },
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
          // name: { equals: name, mode: 'insensitive' },
          name: name,
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
      });
      return {
        ...batch,
        job_count: 0,
      } as Batch;
    } catch (error) {
      this.logger.error('Error creating batch:', error);
      throw error;
    }
  }

  async findBatchById(id: string): Promise<Batch> {
    try {
      const batch = await this.db.batch.findUnique({
        where: { id },
      });

      if (!batch) {
        throw new Error(`Batch with ID ${id} not found`);
      }

      const jobCount = await this.db.job.count({
        where: { batch_id: id },
      });

      return {
        ...batch,
        job_count: jobCount,
      } as Batch;
    } catch (error) {
      this.logger.error('Error finding batch by ID:', error);
      throw error;
    }
  }

  async findBatchByName(name: string): Promise<Batch | null> {
    try {
      const batch = await this.db.batch.findFirst({
        where: { name },
      });

      return batch;
    } catch (error) {
      this.logger.error('Error finding batch by name:', error);
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
        orderBy: {
          createdAt: 'desc',
        },
      });

      const batchesWithJobCount = await Promise.all(
        batches.map(async (batch) => {
          const jobCount = await this.db.job.count({
            where: { batch_id: batch.id },
          });
          return {
            ...batch,
            job_count: jobCount,
          };
        }),
      );

      return batchesWithJobCount as Batch[];
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
      });

      const jobCount = await this.db.job.count({
        where: { batch_id: id },
      });

      return {
        ...batch,
        job_count: jobCount,
      } as Batch;
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

      // Check if there are any jobs with this batch_id
      const jobsCount = await this.db.job.count({
        where: { batch_id: id },
      });

      if (jobsCount > 0) {
        throw new Error(
          `Cannot delete batch. This batch is currently assigned to ${jobsCount} job(s). Please remove the batch from all jobs before deleting.`,
        );
      }

      // Delete the batch if no jobs are associated
      await this.db.batch.delete({
        where: { id },
      });

      return batchToDelete as Batch;
    } catch (error) {
      this.logger.error('Error deleting batch:', error);
      throw error;
    }
  }

  async bulkBatchUpdate(
    jobIds: string[],
    batchId: string,
  ): Promise<{ count: number }> {
    try {
      // Verify batch exists
      const batch = await this.db.batch.findFirst({
        where: { id: batchId },
      });

      if (!batch) {
        throw new Error(`Batch with ID ${batchId} not found`);
      }

      // Update all jobs with the batch_id
      const result = await this.db.job.updateMany({
        where: {
          id: {
            in: jobIds,
          },
        },
        data: {
          batch_id: batchId,
        },
      });

      return result;
    } catch (error) {
      this.logger.error('Error bulk updating jobs batch:', error);
      throw error;
    }
  }

  async bulkArchiveUpdate(
    jobIds: string[],
    isArchived: boolean,
  ): Promise<{ count: number }> {
    try {
      // Update all jobs with the is_archived status
      const result = await this.db.job.updateMany({
        where: {
          id: {
            in: jobIds,
          },
        },
        data: {
          is_archived: isArchived,
        },
      });

      return result;
    } catch (error) {
      this.logger.error('Error bulk updating jobs archive status:', error);
      throw error;
    }
  }

  async bulkDelete(
    jobIds: string[],
  ): Promise<{ count: number; deletedJobIds: string[] }> {
    try {
      // First, verify which jobs exist
      const existingJobs = await this.db.job.findMany({
        where: {
          id: {
            in: jobIds,
          },
        },
        select: {
          id: true,
        },
      });

      const existingJobIds = existingJobs.map((job) => job.id);

      if (existingJobIds.length === 0) {
        return {
          count: 0,
          deletedJobIds: [],
        };
      }

      // Delete all associated job items for these jobs
      await this.db.jobItem.deleteMany({
        where: {
          job_id: {
            in: existingJobIds,
          },
        },
      });

      // Delete all associated db data for these jobs
      await this.db.dbData.deleteMany({
        where: {
          job_id: {
            in: existingJobIds,
          },
        },
      });

      // Then delete all existing jobs
      const result = await this.db.job.deleteMany({
        where: {
          id: {
            in: existingJobIds,
          },
        },
      });

      return {
        count: result.count,
        deletedJobIds: existingJobIds,
      };
    } catch (error) {
      this.logger.error('Error bulk deleting jobs:', error);
      throw error;
    }
  }

  async bulkDeleteBatches(batchIds: string[]): Promise<{
    deletedCount: number;
    skippedCount: number;
    deletedBatchIds: string[];
    skippedBatches: Array<{
      batch_id: string;
      batch_name: string;
      job_count: number;
      reason: string;
    }>;
  }> {
    try {
      const deletedBatchIds: string[] = [];
      const skippedBatches: Array<{
        batch_id: string;
        batch_name: string;
        job_count: number;
        reason: string;
      }> = [];

      // Process each batch individually
      for (const batchId of batchIds) {
        try {
          // Get batch details
          const batch = await this.db.batch.findUnique({
            where: { id: batchId },
            select: {
              id: true,
              name: true,
            },
          });

          if (!batch) {
            // Batch doesn't exist, skip it
            continue;
          }

          // Check if there are any jobs with this batch_id
          const jobsCount = await this.db.job.count({
            where: { batch_id: batchId },
          });

          if (jobsCount > 0) {
            // Skip this batch and add to skipped list
            skippedBatches.push({
              batch_id: batch.id,
              batch_name: batch.name,
              job_count: jobsCount,
              reason: `This batch is currently assigned to ${jobsCount} job(s). Please remove the batch from all jobs before deleting.`,
            });
            continue;
          }

          // No jobs associated, safe to delete
          await this.db.batch.delete({
            where: { id: batchId },
          });

          deletedBatchIds.push(batch.id);
        } catch (error) {
          this.logger.error(`Error processing batch ${batchId}:`, error);
          // Continue with next batch even if one fails
          continue;
        }
      }

      return {
        deletedCount: deletedBatchIds.length,
        skippedCount: skippedBatches.length,
        deletedBatchIds,
        skippedBatches,
      };
    } catch (error) {
      this.logger.error('Error bulk deleting batches:', error);
      throw error;
    }
  }

  /**
   * Returns the job IDs for a given recurring report bucket. Used by the
   * GET /jobs/export-master/by-recurring endpoint to resolve filters into
   * an explicit ID list before delegating to the regular master-export
   * pipeline. Skips archived jobs to mirror the frontend list view.
   */
  async findJobIdsByRecurring(
    recurringId: string,
    bucketId: string,
  ): Promise<string[]> {
    try {
      const jobs = await this.db.job.findMany({
        where: {
          recurring_id: recurringId,
          recurring_report_bucket_id: bucketId,
          is_archived: false,
        },
        select: { id: true },
      });
      return jobs.map((j) => j.id);
    } catch (error) {
      this.logger.error(
        `Error finding job IDs by recurring: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findManyForMasterExport(jobIds: string[]): Promise<any[]> {
    try {
      const jobs = await this.db.job.findMany({
        where: { id: { in: jobIds } },
        include: {
          batch: { select: { id: true, name: true } },
          portfolio: { select: { id: true, name: true } },
          property: {
            select: {
              id: true,
              name: true,
              expedia_id: true,
              booking_id: true,
              agoda_id: true,
            },
          },
          jobItem: {
            orderBy: { createdAt: 'asc' },
            include: {
              cardActivity: true,
            },
          },
        },
      });
      return jobs;
    } catch (error) {
      this.logger.error(
        `Error loading jobs for master export: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findDbEntriesByJobId(jobId: string): Promise<DbEntry[]> {
    try {
      const dbEntries = await this.db.dbEntry.findMany({
        where: { job_id: jobId },
        include: {
          job: {
            select: {
              id: true,
              name: true,
              property_name: true,
              job_status: true,
              portfolio_name: true,
            },
          },
          dbData: {
            select: {
              gearbox_queue_ids: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });
      return dbEntries;
    } catch (error) {
      this.logger.error(
        `Error finding DbEntry by job ID: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
