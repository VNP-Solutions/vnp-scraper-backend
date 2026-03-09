import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Job, JobStatus, RecurringJob, RecurringReportBucket } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { IJobRepository } from '../job/job.interface';
import { IScheduledJobService } from '../scraper/scheduled-job.interface';
import {
  CreateRecurringJobDto,
  CreateRecurringJobFromJobDto,
  UpdateRecurringJobDto,
  UpdateRecurringJobStatusDto,
} from './recurring-job.dto';
import {
  IRecurringJobRepository,
  IRecurringJobService,
  RecurringJobWithBucketsAndJobs,
} from './recurring-job.interface';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April',
  'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
];

@Injectable()
export class RecurringJobService implements IRecurringJobService {
  constructor(
    @Inject('IRecurringJobRepository')
    private readonly repository: IRecurringJobRepository,
    @Inject('IJobRepository')
    private readonly jobRepository: IJobRepository,
    @Inject('IScheduledJobService')
    private readonly scheduledJobService: IScheduledJobService,
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  /**
   * Get the last day of a given month
   */
  private getLastDayOfMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
  }

  /**
   * Get single month date range (previous month relative to schedule date).
   * Each job always covers exactly 1 month of data.
   * For schedule_date 2026-02-15 → covers Jan 2026 (start: 2026-01-01, end: 2026-01-31)
   */
  private getMonthlyDateRange(scheduleDate: string): {
    startDate: string;
    endDate: string;
  } {
    const date = new Date(scheduleDate);
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed

    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const lastDay = this.getLastDayOfMonth(prevYear, prevMonth + 1);

    const startDate = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
    const endDate = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    return { startDate, endDate };
  }

  /**
   * Generate the bucket name: "Reporting for Start MMM - End MMM YYYY"
   *
   * The bucket name reflects the data period covered by all jobs in the bucket.
   * Each bucket contains `duration` jobs, each covering 1 month.
   *
   * Example: first schedule_date = 2026-03-15, duration = 2
   *   - Jobs cover: Feb 2026, Mar 2026 (data months)
   *   - Bucket name: "Reporting for Feb - Mar 2026"
   */
  private generateBucketName(
    firstScheduleDate: string,
    duration: number,
  ): string {
    const date = new Date(firstScheduleDate);
    const scheduleMonth = date.getMonth(); // 0-indexed
    const scheduleYear = date.getFullYear();

    // First job covers the previous month
    let startMonth = scheduleMonth - 1;
    let startYear = scheduleYear;
    if (startMonth < 0) {
      startMonth = 11;
      startYear -= 1;
    }

    // Last job covers (startMonth + duration - 1)
    let endMonth = startMonth + duration - 1;
    let endYear = startYear;
    while (endMonth > 11) {
      endMonth -= 12;
      endYear += 1;
    }

    const startMonthName = MONTH_NAMES[startMonth];
    const endMonthName = MONTH_NAMES[endMonth];

    return `Reporting for ${startMonthName} - ${endMonthName} ${endYear}`;
  }

  /**
   * Get next schedule date (advance by 1 month from current schedule date).
   * Since each job covers 1 month, the next schedule is always 1 month later.
   */
  private getNextMonthScheduleDate(currentScheduleDate: string): string {
    const date = new Date(currentScheduleDate);
    const currentDay = date.getDate();
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed

    let nextMonth = month + 1;
    let nextYear = year;

    if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }

    const lastDayOfNextMonth = this.getLastDayOfMonth(nextYear, nextMonth + 1);
    const nextDay = Math.min(currentDay, lastDayOfNextMonth);

    return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
  }

  /**
   * Generate a name for recurring job based on property name and OTA provider
   * Format: "property_name - ota_provider"
   */
  private generateRecurringJobName(
    propertyName: string,
    otaProvider: string,
  ): string {
    return `${propertyName} - ${otaProvider}`;
  }

  /**
   * Generate a list of month-year strings from initial_date to schedule_date (excluding schedule_date month)
   * Example: initial_date = 2026-01-15, schedule_date = 2026-06-05
   * Returns: ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05']
   */
  private getHistoricalMonths(initial_date: string, schedule_date: string): string[] {
    const initialDate = new Date(initial_date);
    const scheduleDate = new Date(schedule_date);
    
    const months: string[] = [];
    
    // Start from the month before the initial_date month
    const currentDate = new Date(initialDate.getFullYear(), initialDate.getMonth() - 1, 1);
    
    // End at the month before schedule_date month
    const endDate = new Date(scheduleDate.getFullYear(), scheduleDate.getMonth() - 1, 1);
    
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      months.push(`${year}-${month}`);
      
      // Move to next month
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    return months;
  }

  /**
   * Check if a job exists for a recurring job in a specific month
   */
  private async checkJobExistsInMonth(
    recurringId: string,
    targetMonth: string, // Format: YYYY-MM
  ): Promise<boolean> {
    const jobs = await this.repository.findJobsByRecurringId(recurringId);

    for (const job of jobs) {
      if (job.schedule_date) {
        const jobMonth = job.schedule_date.substring(0, 7);
        if (jobMonth === targetMonth) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Create a job using template data, linked to a bucket
   */
  private async createJobFromTemplate(
    templateData: any,
    overrides: {
      recurring_id: string;
      bucket_id: string;
      schedule_date: string;
      start_date: string;
      end_date: string;
      name: string;
    },
  ): Promise<Job> {
    return this.jobRepository.create({
      job_status: JobStatus.Pending,
      portfolio_id: templateData.portfolio_id,
      sub_portfolio_id: templateData.sub_portfolio_id,
      property_id: templateData.property_id,
      user_id: templateData.user_id,
      recurring_id: overrides.recurring_id,
      recurring_report_bucket_id: overrides.bucket_id,
      posting_type: templateData.posting_type,
      portfolio_name: templateData.portfolio_name,
      sub_portfolio_name: templateData.sub_portfolio_name,
      property_name: templateData.property_name,
      billing_type: templateData.billing_type,
      next_due_date: templateData.next_due_date,
      schedule_date: overrides.schedule_date,
      ota_provider: templateData.ota_provider,
      remaining_direct_billed: templateData.remaining_direct_billed,
      total_collectable: templateData.total_collectable,
      total_amount_confirmed: templateData.total_amount_confirmed,
      execution_type: templateData.execution_type,
      retries_attempted: 0,
      max_retries: templateData.max_retries,
      retry_delay_ms: templateData.retry_delay_ms,
      priority: templateData.priority,
      job_backoff_length_loading: templateData.job_backoff_length_loading,
      job_backoff_length_selector: templateData.job_backoff_length_selector,
      queue_name: templateData.queue_name,
      worker_assigned: templateData.worker_assigned,
      batch_execution_id: templateData.batch_execution_id,
      start_date: overrides.start_date,
      end_date: overrides.end_date,
      log_link: templateData.log_link,
      live_url: templateData.live_url,
      watcher_emails: templateData.watcher_emails,
      db_billing_duration: templateData.db_billing_duration,
      name: overrides.name,
    });
  }

  /**
   * Create a new recurring job with its first report bucket and first monthly job.
   *
   * Structure:
   *   RecurringJob → ReportBucket #1 → Job #1 (1 month of data)
   *
   * Each month the cron creates the next job. When a bucket fills up
   * (i.e., has `duration` jobs), the next job starts a new bucket.
   */
  async createRecurringJob(
    data: CreateRecurringJobDto,
  ): Promise<{ recurringJob: RecurringJob; bucket: RecurringReportBucket; job: Job; historicalJobs?: Job[]; buckets?: RecurringReportBucket[] }> {
    try {
      const { schedule_date, user_id, duration, ota_provider, property_name, initial_date, ...jobData } = data;
      const durationValue = duration ?? 1;

      // Generate name: "property_name - ota_provider"
      const recurringJobName = this.generateRecurringJobName(
        property_name,
        ota_provider,
      );

      // Check if recurring job with this name already exists
      const existingRecurringJob = await this.repository.findByName(recurringJobName);
      if (existingRecurringJob) {
        throw new BadRequestException(
          `Recurring job with name "${recurringJobName}" already exists`,
        );
      }

      // next_date will be set to the schedule_date of the first job
      // This represents when the latest job will run
      const nextDate = schedule_date;

      // Get property details including portfolio if not provided
      let hotel_id = null;
      let portfolio_id = data.portfolio_id;
      let portfolio_name = data.portfolio_name;

      if (data.property_id && ota_provider) {
        const property = await this.db.property.findUnique({
          where: { id: data.property_id },
          select: {
            expedia_id: true,
            agoda_id: true,
            booking_id: true,
            portfolio_id: true,
            portfolio: {
              select: {
                name: true,
              },
            },
          },
        });
        
        if (property) {
          // Select the appropriate ID based on OTA provider
          switch (ota_provider) {
            case 'Expedia':
              hotel_id = property.expedia_id;
              break;
            case 'Agoda':
              hotel_id = property.agoda_id;
              break;
            case 'Booking':
              hotel_id = property.booking_id;
              break;
          }

          // If portfolio not provided, get it from property
          if (!portfolio_id && property.portfolio_id) {
            portfolio_id = property.portfolio_id;
            portfolio_name = property.portfolio?.name;
          }
        }
      }

      // Create the recurring job
      const recurringJob = await this.repository.create({
        name: recurringJobName,
        schedule_date: schedule_date,
        next_date: nextDate,
        ota_provider: ota_provider,
        duration: durationValue,
        is_active: true,
        portfolio_id,
        portfolio_name,
        property_id: data.property_id,
        property_name: property_name,
        hotel_id,
      });

      const historicalJobs: Job[] = [];
      const createdBuckets: RecurringReportBucket[] = [];

      // Handle historical jobs if initial_date is provided
      if (initial_date) {
        this.logger.log(`Creating historical jobs from ${initial_date} to ${schedule_date}`);
        
        const historicalMonths = this.getHistoricalMonths(initial_date, schedule_date);
        let bucketNumber = 1;
        let currentBucket: RecurringReportBucket | null = null;
        let jobsInCurrentBucket = 0;

        for (const monthStr of historicalMonths) {
          // Create new bucket if needed
          if (!currentBucket || jobsInCurrentBucket >= durationValue) {
            const [year, month] = monthStr.split('-');
            const bucketStartDate = `${year}-${month}-01`;
            const bucketName = this.generateBucketName(bucketStartDate, durationValue);
            
            currentBucket = await this.repository.createBucket({
              recurring_id: recurringJob.id,
              bucket_number: bucketNumber,
              name: bucketName,
            });
            
            createdBuckets.push(currentBucket);
            this.logger.log(`Created bucket ${currentBucket.id} (${bucketName}) for recurring job ${recurringJob.id}`);
            
            bucketNumber++;
            jobsInCurrentBucket = 0;
          }

          // Calculate date range for this month
          const [year, month] = monthStr.split('-');
          const startDate = `${year}-${month}-01`;
          const lastDay = this.getLastDayOfMonth(parseInt(year), parseInt(month));
          const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

          // Create job for this historical month with the schedule_date for execution
          try {
            const historicalJob = await this.jobRepository.create({
              ...jobData,
              job_status: jobData.job_status || JobStatus.Pending,
              property_name,
              ota_provider,
              user_id,
              recurring_id: recurringJob.id,
              recurring_report_bucket_id: currentBucket!.id,
              start_date: startDate,
              end_date: endDate,
              schedule_date: schedule_date, // All historical jobs will run on the same schedule_date
              name: `${recurringJobName} - ${startDate} to ${endDate}`,
              next_due_date: jobData.next_due_date
                ? new Date(jobData.next_due_date)
                : null,
            });

            this.logger.log(`Created historical job ${historicalJob.id} for period ${startDate} to ${endDate} in bucket ${currentBucket.id}`);
            
            historicalJobs.push(historicalJob);
            jobsInCurrentBucket++;
          } catch (jobError) {
            this.logger.error(`Failed to create historical job for period ${startDate} to ${endDate}:`, jobError);
            throw jobError;
          }
        }

        // Add all historical jobs to the scheduler
        const allJobIds = historicalJobs.map(j => j.id);
        await this.scheduledJobService.createOrUpdateScheduledJob(
          schedule_date,
          allJobIds,
        );

        this.logger.log(
          `Created recurring job ${recurringJob.id} with ${createdBuckets.length} buckets and ${historicalJobs.length} jobs, all scheduled for ${schedule_date}`,
        );

        // Return the first bucket and first job, with all historical jobs
        return { 
          recurringJob, 
          bucket: createdBuckets[0], 
          job: historicalJobs[0], 
          historicalJobs,
          buckets: createdBuckets 
        };
      }

      // Normal flow without historical jobs
      // Create first bucket
      const bucketName = this.generateBucketName(schedule_date, durationValue);
      const bucket = await this.repository.createBucket({
        recurring_id: recurringJob.id,
        bucket_number: 1,
        name: bucketName,
      });

      // Get the 1-month date range for the first job
      const { startDate, endDate } = this.getMonthlyDateRange(schedule_date);

      // Create the first job linked to this recurring job and bucket
      const job = await this.jobRepository.create({
        ...jobData,
        property_name,
        ota_provider,
        user_id,
        recurring_id: recurringJob.id,
        recurring_report_bucket_id: bucket.id,
        start_date: startDate,
        end_date: endDate,
        schedule_date: schedule_date,
        name: `${recurringJobName} - ${startDate} to ${endDate}`,
        next_due_date: jobData.next_due_date
          ? new Date(jobData.next_due_date)
          : null,
      });

      // Add job to scheduler
      await this.scheduledJobService.createOrUpdateScheduledJob(
        schedule_date,
        [job.id],
      );

      this.logger.log(
        `Created recurring job ${recurringJob.id} with bucket "${bucketName}" and initial job ${job.id} covering ${startDate} to ${endDate}`,
      );

      return { recurringJob, bucket, job, buckets: [bucket] };
    } catch (error) {
      this.logger.error('Error creating recurring job:', error);
      throw error;
    }
  }

  /**
   * Create a recurring job from an existing job
   */
  async createRecurringJobFromJob(
    data: CreateRecurringJobFromJobDto,
  ): Promise<{ recurringJob: RecurringJob; bucket: RecurringReportBucket; job: Job; historicalJobs?: Job[]; buckets?: RecurringReportBucket[] }> {
    try {
      const { job_id, schedule_date, duration, initial_date } = data;
      const durationValue = duration ?? 1;

      const existingJob = await this.jobRepository.findById(job_id);

      if (!existingJob) {
        throw new NotFoundException(`Job with ID ${job_id} not found`);
      }

      // Generate name: "property_name - ota_provider"
      const recurringJobName = this.generateRecurringJobName(
        existingJob.property_name,
        existingJob.ota_provider,
      );

      // Check if recurring job with this name already exists
      const existingRecurringJob = await this.repository.findByName(recurringJobName);
      if (existingRecurringJob) {
        throw new BadRequestException(
          `Recurring job with name "${recurringJobName}" already exists`,
        );
      }

      // next_date will be set to the schedule_date of the first job
      // This represents when the latest job will run
      const nextDate = schedule_date;

      // Get property details including portfolio if not provided in existingJob
      let hotel_id = null;
      let portfolio_id = existingJob.portfolio_id;
      let portfolio_name = existingJob.portfolio_name;

      if (existingJob.property_id && existingJob.ota_provider) {
        const property = await this.db.property.findUnique({
          where: { id: existingJob.property_id },
          select: {
            expedia_id: true,
            agoda_id: true,
            booking_id: true,
            portfolio_id: true,
            portfolio: {
              select: {
                name: true,
              },
            },
          },
        });
        
        if (property) {
          // Select the appropriate ID based on OTA provider
          switch (existingJob.ota_provider) {
            case 'Expedia':
              hotel_id = property.expedia_id;
              break;
            case 'Agoda':
              hotel_id = property.agoda_id;
              break;
            case 'Booking':
              hotel_id = property.booking_id;
              break;
          }

          // If portfolio not provided in existingJob, get it from property
          if (!portfolio_id && property.portfolio_id) {
            portfolio_id = property.portfolio_id;
            portfolio_name = property.portfolio?.name;
          }
        }
      }

      // Create the recurring job
      const recurringJob = await this.repository.create({
        name: recurringJobName,
        schedule_date: schedule_date,
        next_date: nextDate,
        ota_provider: existingJob.ota_provider,
        duration: durationValue,
        is_active: true,
        portfolio_id,
        portfolio_name,
        property_id: existingJob.property_id,
        property_name: existingJob.property_name,
        hotel_id,
      });

      const historicalJobs: Job[] = [];
      const createdBuckets: RecurringReportBucket[] = [];

      // Handle historical jobs if initial_date is provided
      if (initial_date) {
        this.logger.log(`Creating historical jobs from ${initial_date} to ${schedule_date}`);
        
        const historicalMonths = this.getHistoricalMonths(initial_date, schedule_date);
        let bucketNumber = 1;
        let currentBucket: RecurringReportBucket | null = null;
        let jobsInCurrentBucket = 0;

        for (const monthStr of historicalMonths) {
          // Create new bucket if needed
          if (!currentBucket || jobsInCurrentBucket >= durationValue) {
            const [year, month] = monthStr.split('-');
            const bucketStartDate = `${year}-${month}-01`;
            const bucketName = this.generateBucketName(bucketStartDate, durationValue);
            
            currentBucket = await this.repository.createBucket({
              recurring_id: recurringJob.id,
              bucket_number: bucketNumber,
              name: bucketName,
            });
            
            createdBuckets.push(currentBucket);
            this.logger.log(`Created bucket ${currentBucket.id} (${bucketName}) for recurring job ${recurringJob.id}`);
            
            bucketNumber++;
            jobsInCurrentBucket = 0;
          }

          // Calculate date range for this month
          const [year, month] = monthStr.split('-');
          const startDate = `${year}-${month}-01`;
          const lastDay = this.getLastDayOfMonth(parseInt(year), parseInt(month));
          const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

          // Create job for this historical month with the schedule_date for execution
          try {
            const historicalJob = await this.createJobFromTemplate(existingJob, {
              recurring_id: recurringJob.id,
              bucket_id: currentBucket!.id,
              schedule_date: schedule_date, // All historical jobs will run on the same schedule_date
              start_date: startDate,
              end_date: endDate,
              name: `${recurringJobName} - ${startDate} to ${endDate}`,
            });

            this.logger.log(`Created historical job ${historicalJob.id} for period ${startDate} to ${endDate} in bucket ${currentBucket.id}`);

            historicalJobs.push(historicalJob);
            jobsInCurrentBucket++;
          } catch (jobError) {
            this.logger.error(`Failed to create historical job for period ${startDate} to ${endDate}:`, jobError);
            throw jobError;
          }
        }

        // Add all historical jobs to the scheduler
        const allJobIds = historicalJobs.map(j => j.id);
        await this.scheduledJobService.createOrUpdateScheduledJob(
          schedule_date,
          allJobIds,
        );

        this.logger.log(
          `Created recurring job ${recurringJob.id} from job ${job_id} with ${createdBuckets.length} buckets and ${historicalJobs.length} jobs, all scheduled for ${schedule_date}`,
        );

        // Return the first bucket and first job, with all historical jobs
        return { 
          recurringJob, 
          bucket: createdBuckets[0], 
          job: historicalJobs[0], 
          historicalJobs,
          buckets: createdBuckets 
        };
      }

      // Normal flow without historical jobs
      // Create first bucket
      const bucketName = this.generateBucketName(schedule_date, durationValue);
      const bucket = await this.repository.createBucket({
        recurring_id: recurringJob.id,
        bucket_number: 1,
        name: bucketName,
      });

      // Get 1-month date range for the first job
      const { startDate, endDate } = this.getMonthlyDateRange(schedule_date);

      // Create the first job linked to the bucket
      const job = await this.createJobFromTemplate(existingJob, {
        recurring_id: recurringJob.id,
        bucket_id: bucket.id,
        schedule_date: schedule_date,
        start_date: startDate,
        end_date: endDate,
        name: `${recurringJobName} - ${startDate} to ${endDate}`,
      });

      // Add job to scheduler
      await this.scheduledJobService.createOrUpdateScheduledJob(
        schedule_date,
        [job.id],
      );

      this.logger.log(
        `Created recurring job ${recurringJob.id} from job ${job_id} with bucket "${bucketName}" and initial job ${job.id}`,
      );

      return { recurringJob, bucket, job, buckets: [bucket] };
    } catch (error) {
      this.logger.error('Error creating recurring job from job:', error);
      throw error;
    }
  }

  /**
   * Get all recurring jobs with pagination and filters
   * Returns bucket_count and job_count instead of nested data
   */
  async getAllRecurringJobs(query: Record<string, any>): Promise<{
    data: any[];
    metadata: any;
  }> {
    try {
      const result = await this.repository.findAll(query);
      
      // Transform data to include counts instead of nested buckets/jobs
      const transformedData = result.data.map((recurringJob: any) => {
        const { _count, ...rest } = recurringJob;
        return {
          ...rest,
          bucket_count: _count?.buckets ?? 0,
          job_count: _count?.jobs ?? 0,
        };
      });

      return {
        data: transformedData,
        metadata: result.metadata,
      };
    } catch (error) {
      this.logger.error('Error getting recurring jobs:', error);
      throw error;
    }
  }

  /**
   * Get recurring job by ID with all its buckets and jobs
   */
  async getRecurringJobById(
    id: string,
  ): Promise<RecurringJobWithBucketsAndJobs> {
    try {
      const recurringJob = await this.repository.findByIdWithJobs(id);

      if (!recurringJob) {
        throw new NotFoundException(`Recurring job with ID ${id} not found`);
      }

      return recurringJob;
    } catch (error) {
      this.logger.error('Error getting recurring job by id:', error);
      throw error;
    }
  }

  /**
   * Update recurring job (mainly schedule_date)
   */
  async updateRecurringJob(
    id: string,
    data: UpdateRecurringJobDto,
  ): Promise<RecurringJob> {
    try {
      const recurringJob = await this.repository.findById(id);

      if (!recurringJob) {
        throw new NotFoundException(`Recurring job with ID ${id} not found`);
      }

      // If schedule_date is being changed
      if (data.schedule_date && data.schedule_date !== recurringJob.schedule_date) {
        const oldScheduleDate = recurringJob.schedule_date;
        const newScheduleDate = data.schedule_date;

        const jobs = await this.repository.findJobsByRecurringId(id);

        if (recurringJob.is_active) {
          // Remove jobs from old schedule date in scheduler
          if (oldScheduleDate) {
            const oldJobIds = jobs
              .filter((job) => job.schedule_date === oldScheduleDate)
              .map((job) => job.id);

            if (oldJobIds.length > 0) {
              await this.scheduledJobService.removeJobsFromScheduledJob(
                oldScheduleDate,
                oldJobIds,
              );
            }
          }

          // Find or create job for new schedule date
          const existingJobForNewDate = jobs.find(
            (job) => job.schedule_date === newScheduleDate,
          );

          if (existingJobForNewDate) {
            await this.scheduledJobService.createOrUpdateScheduledJob(
              newScheduleDate,
              [existingJobForNewDate.id],
            );
          } else {
            const duration = data.duration ?? recurringJob.duration ?? 1;
            const { startDate, endDate } = this.getMonthlyDateRange(newScheduleDate);

            // Get or create bucket for this job
            const latestBucket = await this.repository.findLatestBucketByRecurringId(id);
            let targetBucket = latestBucket;

            if (!targetBucket) {
              const bucketName = this.generateBucketName(newScheduleDate, duration);
              const newBucket = await this.repository.createBucket({
                recurring_id: id,
                bucket_number: 1,
                name: bucketName,
              });
              targetBucket = { ...newBucket, jobs: [] };
            }

            const templateJob = jobs[0];
            if (templateJob) {
              const newJob = await this.createJobFromTemplate(templateJob, {
                recurring_id: id,
                bucket_id: targetBucket.id,
                schedule_date: newScheduleDate,
                start_date: startDate,
                end_date: endDate,
                name: `${recurringJob.name} - ${startDate} to ${endDate}`,
              });

              await this.scheduledJobService.createOrUpdateScheduledJob(
                newScheduleDate,
                [newJob.id],
              );
            }
          }
        }
      }

      const updatedRecurringJob = await this.repository.update(id, data);

      this.logger.log(`Updated recurring job ${id}`);

      return updatedRecurringJob;
    } catch (error) {
      this.logger.error('Error updating recurring job:', error);
      throw error;
    }
  }

  /**
   * Update recurring job status (activate/deactivate)
   */
  async updateRecurringJobStatus(
    id: string,
    data: UpdateRecurringJobStatusDto,
  ): Promise<RecurringJob> {
    try {
      const recurringJob = await this.repository.findById(id);

      if (!recurringJob) {
        throw new NotFoundException(`Recurring job with ID ${id} not found`);
      }

      const { is_active } = data;

      // If activating the recurring job
      if (is_active && !recurringJob.is_active) {
        const scheduleDate = recurringJob.schedule_date;

        if (scheduleDate) {
          const currentMonth = scheduleDate.substring(0, 7);
          const jobExists = await this.checkJobExistsInMonth(id, currentMonth);

          if (!jobExists) {
            const duration = recurringJob.duration ?? 1;
            const { startDate, endDate } = this.getMonthlyDateRange(scheduleDate);

            const jobs = await this.repository.findJobsByRecurringId(id);
            const templateJob = jobs[0];

            if (templateJob) {
              // Get or create bucket
              const latestBucket = await this.repository.findLatestBucketByRecurringId(id);
              let targetBucket = latestBucket;

              if (!targetBucket || latestBucket.jobs.length >= duration) {
                const bucketNumber = targetBucket ? targetBucket.bucket_number + 1 : 1;
                const bucketName = this.generateBucketName(scheduleDate, duration);
                const newBucket = await this.repository.createBucket({
                  recurring_id: id,
                  bucket_number: bucketNumber,
                  name: bucketName,
                });
                targetBucket = { ...newBucket, jobs: [] };
              }

              const newJob = await this.createJobFromTemplate(templateJob, {
                recurring_id: id,
                bucket_id: targetBucket.id,
                schedule_date: scheduleDate,
                start_date: startDate,
                end_date: endDate,
                name: `${recurringJob.name} - ${startDate} to ${endDate}`,
              });

              await this.scheduledJobService.createOrUpdateScheduledJob(
                scheduleDate,
                [newJob.id],
              );

              this.logger.log(
                `Created new job ${newJob.id} in bucket #${targetBucket.bucket_number} for activated recurring job ${id}`,
              );
            } else {
              throw new BadRequestException(
                'No template job found for recurring job',
              );
            }
          } else {
            const jobs = await this.repository.findJobsByRecurringId(id);
            const jobForCurrentMonth = jobs.find(
              (job) => job.schedule_date?.substring(0, 7) === currentMonth,
            );

            if (jobForCurrentMonth) {
              await this.scheduledJobService.createOrUpdateScheduledJob(
                scheduleDate,
                [jobForCurrentMonth.id],
              );
            }
          }
        }
      }

      const updatedRecurringJob = await this.repository.update(id, {
        is_active,
      });

      this.logger.log(
        `Updated recurring job ${id} status to ${is_active ? 'active' : 'inactive'}`,
      );

      return updatedRecurringJob;
    } catch (error) {
      this.logger.error('Error updating recurring job status:', error);
      throw error;
    }
  }

  /**
   * Delete a recurring job
   */
  async deleteRecurringJob(id: string): Promise<RecurringJob> {
    try {
      const recurringJob = await this.repository.findById(id);

      if (!recurringJob) {
        throw new NotFoundException(`Recurring job with ID ${id} not found`);
      }

      const jobs = await this.repository.findJobsByRecurringId(id);
      const jobIds = jobs.map((job) => job.id);

      if (jobIds.length > 0) {
        await this.scheduledJobService.removeJobIdsFromAllScheduledJobs(
          jobIds,
        );
      }

      const deletedRecurringJob = await this.repository.delete(id);

      this.logger.log(
        `Deleted recurring job ${id} and its ${jobIds.length} jobs`,
      );

      return deletedRecurringJob;
    } catch (error) {
      this.logger.error('Error deleting recurring job:', error);
      throw error;
    }
  }

  /**
   * Create the next monthly job for a recurring job (called after cron execution).
   *
   * Logic:
   * 1. Find the latest bucket for this recurring job
   * 2. Count jobs in the latest bucket
   * 3. If bucket is full (jobs >= duration), create a new bucket
   * 4. Create next monthly job in the target bucket
   * 5. Schedule the job
   */
  async createNextMonthJob(
    recurringId: string,
    currentScheduleDate: string,
  ): Promise<Job | null> {
    try {
      const recurringJob = await this.repository.findById(recurringId);

      if (!recurringJob || !recurringJob.is_active) {
        this.logger.warn(
          `Recurring job ${recurringId} not found or not active, skipping next job creation`,
        );
        return null;
      }

      const duration = recurringJob.duration ?? 1;

      // Next schedule date is always 1 month later
      const nextScheduleDate = this.getNextMonthScheduleDate(currentScheduleDate);

      // Get 1-month date range for next job
      const { startDate, endDate } = this.getMonthlyDateRange(nextScheduleDate);

      // Find the latest bucket
      const latestBucket = await this.repository.findLatestBucketByRecurringId(recurringId);

      let targetBucket: RecurringReportBucket & { jobs: Job[] };

      if (!latestBucket) {
        // No bucket exists (legacy data), create one
        const bucketName = this.generateBucketName(nextScheduleDate, duration);
        const newBucket = await this.repository.createBucket({
          recurring_id: recurringId,
          bucket_number: 1,
          name: bucketName,
        });
        targetBucket = { ...newBucket, jobs: [] };
      } else if (latestBucket.jobs.length >= duration) {
        // Current bucket is full, create a new one
        const newBucketNumber = latestBucket.bucket_number + 1;
        const bucketName = this.generateBucketName(nextScheduleDate, duration);
        const newBucket = await this.repository.createBucket({
          recurring_id: recurringId,
          bucket_number: newBucketNumber,
          name: bucketName,
        });
        targetBucket = { ...newBucket, jobs: [] };

        this.logger.log(
          `Bucket #${latestBucket.bucket_number} is full (${latestBucket.jobs.length}/${duration} jobs). Created new bucket #${newBucketNumber} "${bucketName}"`,
        );
      } else {
        targetBucket = latestBucket;
      }

      // Get existing jobs to use as template
      const jobs = await this.repository.findJobsByRecurringId(recurringId);
      const templateJob = jobs[0];

      if (!templateJob) {
        throw new BadRequestException(
          'No template job found for recurring job',
        );
      }

      // Create new job for next month in the target bucket
      const newJob = await this.createJobFromTemplate(templateJob, {
        recurring_id: recurringId,
        bucket_id: targetBucket.id,
        schedule_date: nextScheduleDate,
        start_date: startDate,
        end_date: endDate,
        name: `${recurringJob.name} - ${startDate} to ${endDate}`,
      });

      // Add to scheduler
      await this.scheduledJobService.createOrUpdateScheduledJob(
        nextScheduleDate,
        [newJob.id],
      );

      // Update recurring job's next_date to the newly created job's schedule_date
      await this.repository.update(recurringId, {
        next_date: nextScheduleDate,
      });

      this.logger.log(
        `Created next job ${newJob.id} in bucket #${targetBucket.bucket_number} "${targetBucket.name}" for recurring job ${recurringId}, scheduled for ${nextScheduleDate}, covering ${startDate} to ${endDate}`,
      );

      return newJob;
    } catch (error) {
      this.logger.error('Error creating next month job:', error);
      throw error;
    }
  }

  async getBucketsByRecurringId(
    recurringId: string,
    query: Record<string, any>,
  ): Promise<{
    data: any[];
    metadata: any;
  }> {
    try {
      const recurringJob = await this.repository.findById(recurringId);
      if (!recurringJob) {
        throw new NotFoundException('Recurring job not found');
      }

      const {
        page = 1,
        limit = 10,
        sortBy = 'bucket_number',
        sortOrder = 'asc',
        bucket_number,
        job_status,
      } = query;

      let buckets = await this.repository.findBucketsByRecurringId(recurringId);

      // Filter by bucket_number
      if (bucket_number !== undefined) {
        buckets = buckets.filter(
          (bucket) => bucket.bucket_number === parseInt(bucket_number.toString()),
        );
      }

      // Filter by job_status
      if (job_status) {
        buckets = buckets.filter((bucket) =>
          bucket.jobs.some((job: Job) => job.job_status === job_status),
        );
      }

      // Transform buckets to include running and failed counts, remove jobs
      const transformedBuckets = buckets.map((bucket: any) => {
        const runningCount = bucket.jobs.filter(
          (job: Job) => job.job_status === JobStatus.Running,
        ).length;

        const failedCount = bucket.jobs.filter(
          (job: Job) => job.job_status === JobStatus.Failed,
        ).length;

        const jobCount = bucket.jobs.length;

        // Remove jobs from response, only return counts
        const { jobs, ...bucketWithoutJobs } = bucket;

        return {
          ...bucketWithoutJobs,
          job_count: jobCount,
          running_count: runningCount,
          failed_count: failedCount,
        };
      });

      // Sort
      const sortedBuckets = transformedBuckets.sort((a, b) => {
        const aValue = a[sortBy] ?? 0;
        const bValue = b[sortBy] ?? 0;
        if (sortOrder === 'desc') {
          return bValue > aValue ? 1 : -1;
        }
        return aValue > bValue ? 1 : -1;
      });

      // Pagination
      const total = sortedBuckets.length;
      const skip = (parseInt(page.toString()) - 1) * parseInt(limit.toString());
      const paginatedBuckets = sortedBuckets.slice(
        skip,
        skip + parseInt(limit.toString()),
      );

      return {
        data: paginatedBuckets,
        metadata: {
          totalDocuments: total,
          currentPage: parseInt(page.toString()),
          totalPage: Math.ceil(total / parseInt(limit.toString())),
          limit: parseInt(limit.toString()),
        },
      };
    } catch (error) {
      this.logger.error('Error getting buckets by recurring id:', error);
      throw error;
    }
  }

  async bulkDeleteRecurringJobs(
    ids: string[],
  ): Promise<{ deletedCount: number; deletedIds: string[] }> {
    try {
      if (!ids || ids.length === 0) {
        throw new BadRequestException('No IDs provided for deletion');
      }

      // Use deleteMany for efficient bulk deletion
      const deletedCount = await this.repository.bulkDelete(ids);

      this.logger.log(
        `Bulk deleted ${deletedCount} recurring job(s) and their associated buckets`,
      );

      return {
        deletedCount,
        deletedIds: ids.slice(0, deletedCount), // Return the IDs that were actually deleted
      };
    } catch (error) {
      this.logger.error('Error bulk deleting recurring jobs:', error);
      throw error;
    }
  }

  async getBucketJobs(bucketId: string): Promise<Job[]> {
    try {
      const bucket = await this.repository.findBucketWithJobs(bucketId);
      if (!bucket) {
        throw new NotFoundException('Bucket not found');
      }

      return bucket.jobs;
    } catch (error) {
      this.logger.error('Error getting bucket jobs:', error);
      throw error;
    }
  }
}
