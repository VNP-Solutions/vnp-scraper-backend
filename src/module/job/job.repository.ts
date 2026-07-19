import { Injectable, Logger } from '@nestjs/common';
import { Batch, DbEntry, Job, OTAProvider, Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  CreateBatchDto,
  CreateJobDto,
  JobStatisticsResponseDto,
  UpdateBatchDto,
  UpdateJobDto,
} from './job.dto';
import { IJobRepository } from './job.interface';

/**
 * Field projection shared by every read in the master / dashboard /
 * consolidated XLSX export pipeline. Defined as a module-level constant
 * so the array-based loader (`findManyForMasterExport`) and the cursor-
 * based loader (`streamJobsForMasterExport`) stay byte-identical — if
 * either one drifts, every downstream builder silently breaks.
 *
 * Audited against `master-export.util.ts` and `dashboard-export.util.ts`
 * — only the fields the exporters actually read are projected. The
 * biggest cuts vs a full `include`: dropping `JobItem.raw_response`,
 * scraper booleans, derived caches; dropping `CardActivity.totalSettlement
 * Amount` and join keys (we only need `authorizations`).
 *
 * If you add a column to a builder, add the field here too — otherwise
 * it'll silently come back as `undefined`. NEVER add `Job.batch_name` —
 * the batch name lives on the related `Batch` row (see Prisma model);
 * adding it crashes with "Unknown field `batch_name` for select".
 */
const MASTER_EXPORT_SELECT = {
  id: true,
  ota_provider: true,
  posting_type: true,
  end_date: true,
  start_date: true,
  portfolio_name: true,
  property_name: true,
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
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      createdAt: true,
      reservation_id: true,
      confirmation_number: true,
      guest_name: true,
      check_in_date: true,
      check_out_date: true,
      booking_amount: true,
      payment_info: true,
      card_info: true,
      cardActivity: {
        select: {
          id: true,
          authorizations: true,
        },
      },
    },
  },
} satisfies Prisma.JobSelect;

function summarizeLoadedExportJobs(jobs: any[]): {
  jobCount: number;
  itemCount: number;
  expediaJobCount: number;
} {
  let itemCount = 0;
  let expediaJobCount = 0;

  for (const job of jobs) {
    itemCount += job?.jobItem?.length ?? 0;
    if (job?.ota_provider === OTAProvider.Expedia) {
      expediaJobCount += 1;
    }
  }

  return {
    jobCount: jobs.length,
    itemCount,
    expediaJobCount,
  };
}

/** Logs every `intervalMs` while `query` is still in flight (Mongo can take minutes). */
async function withQueryHeartbeat<T>(
  logger: Logger,
  label: string,
  query: Promise<T>,
  intervalMs = 10_000,
): Promise<T> {
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    logger.log(
      `[MasterExport] ${label} still waiting on MongoDB — ${elapsedSec}s elapsed`,
    );
  }, intervalMs);

  try {
    return await query;
  } finally {
    clearInterval(timer);
  }
}

function estimateLoadedJobsPayloadBytes(jobs: any[]): number {
  try {
    return Buffer.byteLength(JSON.stringify(jobs), 'utf8');
  } catch {
    return 0;
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

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
        server_id,
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
        ...(server_id
          ? { server: { connect: { id: server_id } } }
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
        is_archived,
        filter_invoice_amount,
        job_type,
        schedule_start_date,
        schedule_end_date,
        recurring_id,
        recurring_report_bucket_id,
        portfolio_id,
        property_id,
        ota_provider,
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

      // Filter by portfolio_id
      if (portfolio_id) {
        allFilters.portfolio_id = portfolio_id.toString();
      }

      // Filter by property_id
      if (property_id) {
        allFilters.property_id = property_id.toString();
      }

      // Filter by ota_provider
      if (ota_provider) {
        allFilters.ota_provider = ota_provider.toString();
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
            credentials: true,
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

      // If filter_invoice_amount is true, we need to fetch all jobs first to calculate total count
      // Otherwise, we can use the count query for better performance
      const needsInvoiceFilter =
        filter_invoice_amount === 'true' || filter_invoice_amount === true;

      let totalDocuments: number;
      let jobs: any[];

      if (needsInvoiceFilter) {
        // Fetch all jobs matching filters (without pagination) to calculate invoice amounts and get accurate total count
        const allJobs = await this.db.job.findMany({
          where: allFilters,
          include,
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
        totalDocuments = filteredAllJobs.length;

        // Apply pagination to filtered results
        const skip = page
          ? (parseInt(page || '1') - 1) * parseInt(limit || '10')
          : 0;
        const take = limit ? parseInt(limit) : 10;
        jobs = filteredAllJobs.slice(skip, skip + take);
      } else {
        // Normal flow: use count query for better performance
        totalDocuments = await this.db.job.count({
          where: allFilters,
        });

        const skip = page
          ? (parseInt(page || '1') - 1) * parseInt(limit || '10')
          : 0;
        const take = limit ? parseInt(limit) : 10;

        jobs = await this.db.job.findMany({
          where: allFilters,
          include,
          skip,
          take,
          orderBy,
        });

        // Get all job IDs with billing_type === 'DB'
        const dbJobIds = jobs
          .filter((job) => job.billing_type === 'DB')
          .map((job) => job.id);

        // Fetch all DbData records for DB billing type jobs in a single query
        let totalInvoiceAmountMap = new Map<string, number>();

        if (dbJobIds.length > 0) {
          const dbDataRecords = await this.db.dbData.findMany({
            where: {
              job_id: { in: dbJobIds },
            },
            select: {
              job_id: true,
              total_invoice_amount: true,
            },
          });

          // Group by job_id and calculate sums
          for (const dbData of dbDataRecords) {
            const currentSum = totalInvoiceAmountMap.get(dbData.job_id) || 0;
            const amount = dbData.total_invoice_amount || 0;
            totalInvoiceAmountMap.set(dbData.job_id, currentSum + amount);
          }
        }

        // Add total invoice amount field to jobs with billing_type === 'DB'
        jobs = jobs.map((job) => {
          const jobData = job as any;

          if (job.billing_type === 'DB') {
            const totalInvoiceAmount = totalInvoiceAmountMap.get(job.id) || 0;
            // Round to 2 decimal places to avoid floating point precision issues
            jobData.total_invoice_amount =
              Math.round(totalInvoiceAmount * 100) / 100;
          }

          return jobData;
        });
      }

      const metadata = {
        totalDocuments,
        currentPage: parseInt(page || '1'),
        totalPage: Math.ceil(totalDocuments / parseInt(limit || '10')),
        limit: parseInt(limit || '10'),
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
    nothingToReport: { count: number; percentage: number };
    manual: { count: number; percentage: number };
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
        nothingToReportCount,
        manualCount,
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
        this.db.job.count({
          where: { ...whereClause, job_status: 'NothingToReport' },
        }),
        this.db.job.count({
          where: { ...whereClause, job_status: 'Manual' },
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
        nothingToReport: {
          count: nothingToReportCount,
          percentage: calculatePercentage(nothingToReportCount, totalCount),
        },
        manual: {
          count: manualCount,
          percentage: calculatePercentage(manualCount, totalCount),
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
      nothingToReport: { count: number; percentage: number };
      manual: { count: number; percentage: number };
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
          nothingToReport: number;
          manual: number;
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
          nothingToReport: 0,
          manual: 0,
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
            case 'NothingToReport':
              monthData.nothingToReport++;
              break;
            case 'Manual':
              monthData.manual++;
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
        nothingToReport: {
          count: monthData.nothingToReport,
          percentage: calculatePercentage(monthData.nothingToReport, monthData.total),
        },
        manual: {
          count: monthData.manual,
          percentage: calculatePercentage(monthData.manual, monthData.total),
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
    const BATCH_SIZE = 500;
    let totalCount = 0;

    try {
      for (let i = 0; i < jobIds.length; i += BATCH_SIZE) {
        const batch = jobIds.slice(i, i + BATCH_SIZE);
        const result = await this.db.job.updateMany({
          where: {
            id: {
              in: batch,
            },
          },
          data: {
            is_archived: isArchived,
          },
        });
        totalCount += result.count;
      }

      return { count: totalCount };
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

  /**
   * Load every job referenced by `jobIds` with the relations the master /
   * dashboard / consolidated XLSX exporters need (`batch`, `portfolio`,
   * `property`, `jobItem` + `cardActivity`).
   *
   * Why chunked: a single `findMany({ where: { id: { in: [...] } }, include:
   * { jobItem: { include: { cardActivity: true } } } })` makes Prisma issue
   * one Mongo aggregation per relation. When too many jobs are requested,
   * the `card_activities` aggregation result can blow past Mongo's hard
   * 16 MB BSON limit and the entire query fails with:
   *
   *   "BSONObj size: 25859571 is invalid. Size must be between 0 and
   *    16809984(16MB) First element: aggregate: \"card_activities\"…"
   *
   * That limit lives inside `mongod` — there is no driver / Prisma / Nest
   * setting that can lift it. The only safe fix is to keep each batch's
   * aggregation result small. Splitting jobIds into chunks of
   * `MASTER_EXPORT_JOB_CHUNK_SIZE` and concatenating the results gives the
   * caller the same shape it always got, without any single aggregation
   * approaching 16 MB.
   *
   * Chunks are issued sequentially. Parallelizing would shave wall-clock
   * time but multiplies peak Mongo load (an export of 500 jobs already
   * fans out to 4+ aggregations per chunk for the included relations).
   */
  async findManyForMasterExport(jobIds: string[]): Promise<any[]> {
    try {
      const uniqueIds = Array.from(new Set(jobIds ?? [])).filter(Boolean);
      if (uniqueIds.length === 0) return [];

      // ── Chunking ──────────────────────────────────────────────────────
      // Each Prisma findMany must return < 16 MB BSON (Mongo's hard limit).
      // With the `select` projection below, the per-jobItem payload is
      // ~10× smaller than a full `include`, so 50 jobs/batch is safe with
      // Chunk size = 10. Smaller chunks are safer against MongoDB's 16 MB
      // BSON limit when the join payload (jobItem + nested cardActivity)
      // is fat — large Expedia bookings with many items / authorizations
      // can push a 50-job chunk well into the multi-MB range. Trade-off:
      // more network round-trips, but with `CONCURRENCY = 6` (below)
      // they run in parallel waves, so wall-clock cost is modest.
      // (History: original = 25, briefly bumped to 50 after switching
      // `include` → field-projecting `select`, then lowered to 10 to
      // give comfortable headroom for the largest production tenants.)
      const MASTER_EXPORT_JOB_CHUNK_SIZE = 10;

      // ── Parallelism ───────────────────────────────────────────────────
      // The previous implementation ran chunks sequentially via
      // `for (…) await db.job.findMany(...)`, which is the wrong shape
      // for an Atlas-backed app: every round-trip pays its full network
      // RTT before the next one can even start. We now fire `CONCURRENCY`
      // chunks at once with `Promise.all` and wait between waves, which
      // empirically gives a 5–8× speedup on 1k-job exports.
      //
      // Why 6? It comfortably fits under the default Prisma connection
      // pool (10) — important because other requests share that pool —
      // and matches the practical sweet spot we've seen on M10-class
      // Atlas clusters. Going higher (10+) doesn't speed things up much
      // and risks starving the pool when concurrent exports overlap.
      // The matching `connection_limit` in DATABASE_URL is what makes
      // higher values usable if you ever want to tune it up.
      const CONCURRENCY = 6;

      // Field projection shared with the cursor-based streaming loader.
      // See `MASTER_EXPORT_SELECT` at the top of this file for the audited
      // list of fields and the rationale for what we drop.
      const select = MASTER_EXPORT_SELECT;

      // Split into chunks first so we can run waves of `CONCURRENCY`.
      const chunks: string[][] = [];
      for (let i = 0; i < uniqueIds.length; i += MASTER_EXPORT_JOB_CHUNK_SIZE) {
        chunks.push(uniqueIds.slice(i, i + MASTER_EXPORT_JOB_CHUNK_SIZE));
      }
      const totalWaves = Math.ceil(chunks.length / CONCURRENCY);

      const startedAt = Date.now();
      this.logger.log(
        `[MasterExport] Loading ${uniqueIds.length} jobs in ${chunks.length} ` +
          `chunks of ${MASTER_EXPORT_JOB_CHUNK_SIZE} (concurrency=${CONCURRENCY}, ${totalWaves} wave${totalWaves === 1 ? '' : 's'})`,
      );

      const all: any[] = [];
      let waveIndex = 0;
      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const wave = chunks.slice(i, i + CONCURRENCY);
        waveIndex += 1;
        const waveStartedAt = Date.now();

        this.logger.log(
          `[MasterExport] Wave ${waveIndex}/${totalWaves} starting — ` +
            `${wave.length} chunk(s) in parallel ` +
            `(global chunks ${i + 1}-${i + wave.length} of ${chunks.length})`,
        );

        const waveResults = await Promise.all(
          wave.map(async (chunk, chunkIndexInWave) => {
            const globalChunkIndex = i + chunkIndexInWave;
            const chunkStartedAt = Date.now();

            this.logger.log(
              `[MasterExport] Chunk ${globalChunkIndex + 1}/${chunks.length} query start — ` +
                `${chunk.length} job ID(s): [${chunk.join(', ')}]`,
            );

            const preflightStartedAt = Date.now();
            const preflight = await this.db.job.findMany({
              where: { id: { in: chunk } },
              select: {
                id: true,
                ota_provider: true,
                _count: { select: { jobItem: true } },
              },
            });
            const expectedItems = preflight.reduce(
              (sum, job) => sum + job._count.jobItem,
              0,
            );
            const expediaInChunk = preflight.filter(
              (job) => job.ota_provider === OTAProvider.Expedia,
            ).length;
            this.logger.log(
              `[MasterExport] Chunk ${globalChunkIndex + 1}/${chunks.length} preflight in ` +
                `${Date.now() - preflightStartedAt}ms — ${preflight.length}/${chunk.length} jobs, ` +
                `${expectedItems} job items expected, ${expediaInChunk} Expedia job(s)`,
            );

            const result = await withQueryHeartbeat(
              this.logger,
              `Chunk ${globalChunkIndex + 1}/${chunks.length} nested load`,
              this.db.job.findMany({
                where: { id: { in: chunk } },
                select,
              }),
            );

            const summary = summarizeLoadedExportJobs(result);
            const elapsedMs = Date.now() - chunkStartedAt;
            const payloadBytes = estimateLoadedJobsPayloadBytes(result);

            this.logger.log(
              `[MasterExport] Chunk ${globalChunkIndex + 1}/${chunks.length} query done in ${elapsedMs}ms — ` +
                `${summary.jobCount}/${chunk.length} jobs found, ` +
                `${summary.itemCount} job items, ` +
                `${summary.expediaJobCount} Expedia job(s), ` +
                `payload ~${formatBytes(payloadBytes)}`,
            );

            if (summary.jobCount < chunk.length) {
              const found = new Set(result.map((job) => job.id));
              const missingInChunk = chunk.filter((id) => !found.has(id));
              this.logger.warn(
                `[MasterExport] Chunk ${globalChunkIndex + 1}/${chunks.length} missing ` +
                  `${missingInChunk.length} job ID(s): [${missingInChunk.join(', ')}]`,
              );
            }

            return result;
          }),
        );

        for (const waveResult of waveResults) {
          all.push(...waveResult);
        }

        const waveSummary = summarizeLoadedExportJobs(all);
        this.logger.log(
          `[MasterExport] Wave ${waveIndex}/${totalWaves} complete in ` +
            `${Date.now() - waveStartedAt}ms — cumulative ${waveSummary.jobCount} jobs, ` +
            `${waveSummary.itemCount} job items loaded so far`,
        );
      }

      const totalSummary = summarizeLoadedExportJobs(all);
      this.logger.log(
        `[MasterExport] DB load complete in ${Date.now() - startedAt}ms — ` +
          `${totalSummary.jobCount} jobs, ${totalSummary.itemCount} job items, ` +
          `${totalSummary.expediaJobCount} Expedia job(s) across ${chunks.length} chunk(s)`,
      );
      return all;
    } catch (error) {
      this.logger.error(
        `Error loading jobs for master export: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Lightweight pre-scan that gathers everything the master / consolidated
   * export needs to define column headers UP FRONT — without materializing
   * any job rows.
   *
   * Pairs with {@link streamJobsForMasterExport} to implement the senior-
   * suggested "cursor + S3 stream" pattern: this method tells the writer
   * exactly how many columns the workbook needs (and whether to include
   * Expedia-only columns at all), and the cursor then streams full job
   * payloads one batch at a time.
   *
   * Returns:
   *   - `hasExpedia`         — true iff at least one job in `jobIds` is
   *                            ota_provider === Expedia. Drives whether
   *                            we emit the Card Activity / Approved
   *                            Amount K columns.
   *   - `maxApprovedCount`   — max number of `"Approved"` authorizations
   *                            across all card_activities for Expedia
   *                            jobs in this batch. Determines N for
   *                            `Card Activity Approved Amount {1..N}`.
   *                            Always 0 when `hasExpedia` is false.
   *   - `foundIds`           — set of job IDs that actually exist. The
   *                            caller diffs against `jobIds` to emit
   *                            the "missing IDs" warning.
   *
   * Cost: two queries — one tiny `{ id, ota_provider }` projection over
   * the full id list, then (only when Expedia is present) chunked scans
   * of `JobItem.cardActivity.authorizations` (just the array field) for
   * the Expedia subset. Peak memory: one chunk's authorizations, ~10 MB.
   */
  /**
   * Returns which of the requested job IDs actually exist. Per-job ZIP
   * exports call this instead of {@link precomputeMasterExportContext}
   * because each XLSX inside the archive computes its own column shape
   * from a single job — the cross-job Expedia auth scan is unnecessary
   * and can take 15–30+ minutes on large batches.
   */
  async findExistingJobIdsForExport(jobIds: string[]): Promise<Set<string>> {
    try {
      const uniqueIds = Array.from(new Set(jobIds ?? [])).filter(Boolean);
      if (uniqueIds.length === 0) return new Set<string>();

      const rows = await this.db.job.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true },
      });
      return new Set(rows.map((r) => r.id));
    } catch (error) {
      this.logger.error(
        `Error resolving job IDs for export: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async precomputeMasterExportContext(jobIds: string[]): Promise<{
    hasExpedia: boolean;
    maxApprovedCount: number;
    foundIds: Set<string>;
  }> {
    try {
      const uniqueIds = Array.from(new Set(jobIds ?? [])).filter(Boolean);
      if (uniqueIds.length === 0) {
        return {
          hasExpedia: false,
          maxApprovedCount: 0,
          foundIds: new Set<string>(),
        };
      }

      const startedAt = Date.now();
      this.logger.log(
        `[MasterExport.prescan] Starting for ${uniqueIds.length} job IDs…`,
      );

      // Step 1: cheap projection — { id, ota_provider } only.
      const otaRows = await this.db.job.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, ota_provider: true },
      });
      const foundIds = new Set(otaRows.map((r) => r.id));
      const expediaIds = otaRows
        .filter((r) => r.ota_provider === OTAProvider.Expedia)
        .map((r) => r.id);
      const hasExpedia = expediaIds.length > 0;

      // Step 2: max-approved-authorization scan — only matters for Expedia
      // exports (the non-Expedia path doesn't emit Approved Amount K
      // columns at all, so the value is irrelevant).
      let maxApprovedCount = 0;
      if (hasExpedia) {
        // Chunk size kept conservative: each chunk pulls jobItem.card
        // Activity.authorizations for `CHUNK` jobs, which on Expedia
        // payloads is ~50 items/job × ~3 auths/item × ~200 B = ~30 KB/job.
        // 50 jobs/chunk ≈ 1.5 MB on the wire. Safely under Mongo's 16 MB.
        const CHUNK = 50;
        const totalChunks = Math.ceil(expediaIds.length / CHUNK);
        const logEvery = Math.max(1, Math.floor(totalChunks / 5));
        for (let i = 0; i < expediaIds.length; i += CHUNK) {
          const chunkIdx = Math.floor(i / CHUNK) + 1;
          const chunk = expediaIds.slice(i, i + CHUNK);
          const items = await this.db.jobItem.findMany({
            where: { job_id: { in: chunk } },
            select: {
              cardActivity: {
                select: { authorizations: true },
              },
            },
          });
          for (const item of items) {
            const auths =
              ((item as any).cardActivity?.authorizations as
                | any[]
                | undefined) ?? [];
            let approvedLen = 0;
            for (const a of auths) {
              if (a?.status === 'Approved') approvedLen += 1;
            }
            if (approvedLen > maxApprovedCount) maxApprovedCount = approvedLen;
          }
          if (
            chunkIdx % logEvery === 0 ||
            chunkIdx === totalChunks
          ) {
            this.logger.log(
              `[MasterExport.prescan] Expedia auth scan ` +
                `${chunkIdx}/${totalChunks} chunks ` +
                `(maxApproved=${maxApprovedCount}, ${Date.now() - startedAt}ms)`,
            );
          }
          // `items` falls out of scope at the next iteration → GC-eligible.
        }
      }

      this.logger.log(
        `[MasterExport.prescan] ${uniqueIds.length} jobs (${expediaIds.length} Expedia), ` +
          `maxApproved=${maxApprovedCount}, missing=${uniqueIds.length - foundIds.size}, ` +
          `${Date.now() - startedAt}ms`,
      );

      return { hasExpedia, maxApprovedCount, foundIds };
    } catch (error) {
      this.logger.error(
        `Error in master-export pre-scan: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Counts the total number of `JobItem` rows owned by the given jobs.
   * Used by the streaming export endpoints as a cheap pre-flight check
   * so we can throw a 404 BEFORE opening the S3 multipart upload (no
   * partial uploads to clean up if there's nothing to export).
   *
   * Issued as a single `count` aggregation — bounded RTT, ~tens of ms.
   */
  async countJobItemsByJobIds(jobIds: string[]): Promise<number> {
    try {
      const uniqueIds = Array.from(new Set(jobIds ?? [])).filter(Boolean);
      if (uniqueIds.length === 0) return 0;
      return await this.db.jobItem.count({
        where: { job_id: { in: uniqueIds } },
      });
    } catch (error) {
      this.logger.error(
        `Error counting job items for export: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Async generator that yields one fully-hydrated `Job` (with its
   * `jobItem[]` + nested `cardActivity` projection — see
   * {@link MASTER_EXPORT_SELECT}) at a time, without ever accumulating
   * the full result set in memory.
   *
   * This is the cursor side of the "true streaming" pipeline: while the
   * writer is busy serializing job N's rows into the workbook (and the
   * S3 multipart uploader is busy flushing previous parts), we can be
   * fetching the next batch from Mongo in the background. Peak heap:
   *   - one Prisma batch (`batchSize` jobs) in flight,
   *   - one yielded job being processed by the caller,
   *   - everything else GC-eligible.
   *
   * Sorts `jobIds` ascending so batches are deterministic — important
   * for tests and for users who diff the output of repeated exports.
   *
   * Why generator instead of returning an array: an array (even a
   * promise-of-array) forces the entire result set to exist
   * simultaneously, which is exactly what caused the 1.7 GB OOM in
   * `findManyForMasterExport` on 944-job exports. With a generator the
   * downstream `for await` consumer applies natural back-pressure.
   */
  async *streamJobsForMasterExport(
    jobIds: string[],
    batchSize = 20,
  ): AsyncGenerator<any, void, void> {
    const uniqueIds = Array.from(new Set(jobIds ?? [])).filter(Boolean);
    if (uniqueIds.length === 0) return;

    // Deterministic batching: sort once, then slice.
    const sortedIds = [...uniqueIds].sort();
    const totalBatches = Math.ceil(sortedIds.length / batchSize);
    const logEvery = Math.max(1, Math.floor(totalBatches / 8));
    const startedAt = Date.now();

    this.logger.log(
      `[MasterExport.cursor] Streaming ${sortedIds.length} jobs in ` +
        `${totalBatches} batches of ${batchSize}`,
    );

    let yielded = 0;
    for (let i = 0; i < sortedIds.length; i += batchSize) {
      const chunk = sortedIds.slice(i, i + batchSize);
      const batchIdx = Math.floor(i / batchSize) + 1;
      const batchStartedAt = Date.now();

      this.logger.log(
        `[MasterExport.cursor] Batch ${batchIdx}/${totalBatches} query start — ` +
          `${chunk.length} job ID(s): [${chunk.join(', ')}]`,
      );

      const preflight = await this.db.job.findMany({
        where: { id: { in: chunk } },
        select: {
          id: true,
          ota_provider: true,
          _count: { select: { jobItem: true } },
        },
      });
      const expectedItems = preflight.reduce(
        (sum, job) => sum + job._count.jobItem,
        0,
      );
      this.logger.log(
        `[MasterExport.cursor] Batch ${batchIdx}/${totalBatches} preflight — ` +
          `${preflight.length}/${chunk.length} jobs, ${expectedItems} job items expected`,
      );

      const batch = await withQueryHeartbeat(
        this.logger,
        `Batch ${batchIdx}/${totalBatches} nested load`,
        this.db.job.findMany({
          where: { id: { in: chunk } },
          select: MASTER_EXPORT_SELECT,
        }),
      );

      const summary = summarizeLoadedExportJobs(batch);
      this.logger.log(
        `[MasterExport.cursor] Batch ${batchIdx}/${totalBatches} query done in ` +
          `${Date.now() - batchStartedAt}ms — ${summary.jobCount}/${chunk.length} jobs, ` +
          `${summary.itemCount} job items, ${summary.expediaJobCount} Expedia job(s)`,
      );

      for (const job of batch) {
        yield job;
        yielded += 1;
      }
      // `batch` falls out of scope on the next loop iteration; once the
      // consumer has finished processing the yielded jobs, V8 can reclaim
      // every row object. Peak heap stays at ~one batch.

      if (batchIdx % logEvery === 0 || batchIdx === totalBatches) {
        const pct = Math.round((yielded / sortedIds.length) * 100);
        this.logger.log(
          `[MasterExport.cursor] Batch ${batchIdx}/${totalBatches} delivered — ` +
            `${yielded}/${sortedIds.length} jobs (${pct}%, ${Date.now() - startedAt}ms elapsed)`,
        );
      }
    }

    this.logger.log(
      `[MasterExport.cursor] All ${yielded} jobs streamed in ` +
        `${Date.now() - startedAt}ms`,
    );
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
