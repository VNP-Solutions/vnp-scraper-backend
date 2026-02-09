import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Job, RecurringJob } from '@prisma/client';
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
} from './recurring-job.interface';

@Injectable()
export class RecurringJobService implements IRecurringJobService {
  constructor(
    @Inject('IRecurringJobRepository')
    private readonly repository: IRecurringJobRepository,
    @Inject('IJobRepository')
    private readonly jobRepository: IJobRepository,
    @Inject('IScheduledJobService')
    private readonly scheduledJobService: IScheduledJobService,
    private readonly logger: Logger,
  ) {}

  /**
   * Get the last day of a given month
   */
  private getLastDayOfMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
  }

  /**
   * Get date range for job based on duration
   * If duration is 2 months and schedule_date is 2026-03-15:
   * - start_date: 2026-01-01 (first day of 2 months ago)
   * - end_date: 2026-02-29 (last day of previous month)
   */
  private getDateRangeForDuration(
    scheduleDate: string,
    duration: number,
  ): {
    startDate: string;
    endDate: string;
  } {
    const date = new Date(scheduleDate);
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed

    // Calculate start date (duration months before schedule date)
    let startMonth = month - duration;
    let startYear = year;

    while (startMonth < 0) {
      startMonth += 12;
      startYear -= 1;
    }

    const startDate = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-01`;

    // Calculate end date (last day of previous month)
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const lastDay = this.getLastDayOfMonth(prevYear, prevMonth + 1);
    const endDate = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    return { startDate, endDate };
  }

  /**
   * Get previous month's first and last day (for backward compatibility)
   */
  private getPreviousMonthDates(scheduleDate: string): {
    startDate: string;
    endDate: string;
  } {
    return this.getDateRangeForDuration(scheduleDate, 1);
  }

  /**
   * Get next schedule date by adding duration months
   * If current schedule is 2026-02-15 and duration is 2:
   * - Next schedule will be 2026-04-15 (2 months later)
   */
  private getNextScheduleDate(
    currentScheduleDate: string,
    duration: number,
  ): string {
    const date = new Date(currentScheduleDate);
    const currentDay = date.getDate();
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed

    // Add duration months
    let nextMonth = month + duration;
    let nextYear = year;

    while (nextMonth > 11) {
      nextMonth -= 12;
      nextYear += 1;
    }

    // Handle edge case: if current day doesn't exist in next month (e.g., Jan 31 -> Feb 28)
    const lastDayOfNextMonth = this.getLastDayOfMonth(nextYear, nextMonth + 1);
    const nextDay = Math.min(currentDay, lastDayOfNextMonth);

    return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
  }

  /**
   * Get next month's schedule date (same day) - for backward compatibility
   */
  private getNextMonthScheduleDate(currentScheduleDate: string): string {
    return this.getNextScheduleDate(currentScheduleDate, 1);
  }

  /**
   * Generate a name for recurring job based on property and schedule date
   */
  private generateRecurringJobName(
    propertyName: string,
    scheduleDate: string,
  ): string {
    const date = new Date(scheduleDate);
    const day = date.getDate();
    return `${propertyName} - Day ${day} of Month`;
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
        const jobMonth = job.schedule_date.substring(0, 7); // Extract YYYY-MM
        if (jobMonth === targetMonth) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Create a new recurring job with initial job in scheduler
   */
  async createRecurringJob(
    data: CreateRecurringJobDto,
  ): Promise<{ recurringJob: RecurringJob; job: Job }> {
    try {
      const { schedule_date, user_id, duration, ...jobData } = data;
      const durationValue = duration ?? 1;

      // Generate recurring job name
      const recurringJobName = this.generateRecurringJobName(
        data.property_name,
        schedule_date,
      );

      // Create the recurring job (always active by default)
      const recurringJob = await this.repository.create({
        name: recurringJobName,
        schedule_date: schedule_date,
        duration: durationValue,
        is_active: true, // Always true on creation
      });

      // Get date range based on duration
      const { startDate, endDate } = this.getDateRangeForDuration(
        schedule_date,
        durationValue,
      );

      // Create the first job linked to this recurring job
      const job = await this.jobRepository.create({
        ...jobData,
        user_id,
        recurring_id: recurringJob.id,
        start_date: startDate,
        end_date: endDate,
        schedule_date: schedule_date,
        name: `${recurringJobName} - ${startDate} to ${endDate}`,
        next_due_date: jobData.next_due_date ? new Date(jobData.next_due_date) : null,
      });

      // Add job to scheduler (always active on creation)
      await this.scheduledJobService.createOrUpdateScheduledJob(
        schedule_date,
        [job.id],
      );

      this.logger.log(
        `Created recurring job ${recurringJob.id} with duration ${durationValue} months and initial job ${job.id}`,
      );

      return { recurringJob, job };
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
  ): Promise<{ recurringJob: RecurringJob; job: Job }> {
    try {
      const { job_id, schedule_date, duration } = data;
      const durationValue = duration ?? 1;

      // Get the existing job
      const existingJob = await this.jobRepository.findById(job_id);

      if (!existingJob) {
        throw new NotFoundException(`Job with ID ${job_id} not found`);
      }

      // Generate recurring job name
      const recurringJobName = this.generateRecurringJobName(
        existingJob.property_name,
        schedule_date,
      );

      // Create the recurring job (always active by default)
      const recurringJob = await this.repository.create({
        name: recurringJobName,
        schedule_date: schedule_date,
        duration: durationValue,
        is_active: true, // Always true on creation
      });

      // Get date range based on duration
      const { startDate, endDate } = this.getDateRangeForDuration(
        schedule_date,
        durationValue,
      );

      // Create the first job linked to this recurring job using existing job as template
      const job = await this.jobRepository.create({
        job_status: existingJob.job_status,
        portfolio_id: existingJob.portfolio_id,
        sub_portfolio_id: existingJob.sub_portfolio_id,
        property_id: existingJob.property_id,
        user_id: existingJob.user_id,
        recurring_id: recurringJob.id,
        posting_type: existingJob.posting_type,
        portfolio_name: existingJob.portfolio_name,
        sub_portfolio_name: existingJob.sub_portfolio_name,
        property_name: existingJob.property_name,
        billing_type: existingJob.billing_type,
        next_due_date: existingJob.next_due_date,
        schedule_date: schedule_date,
        ota_provider: existingJob.ota_provider,
        remaining_direct_billed: existingJob.remaining_direct_billed,
        total_collectable: existingJob.total_collectable,
        total_amount_confirmed: existingJob.total_amount_confirmed,
        execution_type: existingJob.execution_type,
        retries_attempted: 0, // Reset retries
        max_retries: existingJob.max_retries,
        retry_delay_ms: existingJob.retry_delay_ms,
        priority: existingJob.priority,
        job_backoff_length_loading: existingJob.job_backoff_length_loading,
        job_backoff_length_selector: existingJob.job_backoff_length_selector,
        queue_name: existingJob.queue_name,
        worker_assigned: existingJob.worker_assigned,
        batch_execution_id: existingJob.batch_execution_id,
        start_date: startDate,
        end_date: endDate,
        log_link: existingJob.log_link,
        live_url: existingJob.live_url,
        watcher_emails: existingJob.watcher_emails,
        db_billing_duration: existingJob.db_billing_duration,
        name: `${recurringJobName} - ${startDate} to ${endDate}`,
      });

      // Add job to scheduler (always active on creation)
      await this.scheduledJobService.createOrUpdateScheduledJob(
        schedule_date,
        [job.id],
      );

      this.logger.log(
        `Created recurring job ${recurringJob.id} with duration ${durationValue} months from existing job ${job_id} with initial job ${job.id}`,
      );

      return { recurringJob, job };
    } catch (error) {
      this.logger.error('Error creating recurring job from job:', error);
      throw error;
    }
  }

  /**
   * Get all recurring jobs with pagination and filters
   */
  async getAllRecurringJobs(query: Record<string, any>): Promise<{
    data: RecurringJob[];
    metadata: any;
  }> {
    try {
      const result = await this.repository.findAll(query);
      return result;
    } catch (error) {
      this.logger.error('Error getting recurring jobs:', error);
      throw error;
    }
  }

  /**
   * Get recurring job by ID with all its jobs
   */
  async getRecurringJobById(
    id: string,
  ): Promise<RecurringJob & { jobs: Job[] }> {
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

        // Get all jobs for this recurring job
        const jobs = await this.repository.findJobsByRecurringId(id);

        // If recurring job is active, we need to handle scheduler updates
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
            // Add existing job to new schedule date
            await this.scheduledJobService.createOrUpdateScheduledJob(
              newScheduleDate,
              [existingJobForNewDate.id],
            );
          } else {
            // Create new job for the new schedule date
            const duration = data.duration ?? recurringJob.duration ?? 1;
            const { startDate, endDate } = this.getDateRangeForDuration(
              newScheduleDate,
              duration,
            );

            // Get job template from existing jobs
            const templateJob = jobs[0];
            if (templateJob) {
              const newJob = await this.jobRepository.create({
                job_status: templateJob.job_status,
                portfolio_id: templateJob.portfolio_id,
                sub_portfolio_id: templateJob.sub_portfolio_id,
                property_id: templateJob.property_id,
                user_id: templateJob.user_id,
                recurring_id: id,
                posting_type: templateJob.posting_type,
                portfolio_name: templateJob.portfolio_name,
                sub_portfolio_name: templateJob.sub_portfolio_name,
                property_name: templateJob.property_name,
                billing_type: templateJob.billing_type,
                next_due_date: templateJob.next_due_date,
                schedule_date: newScheduleDate,
                ota_provider: templateJob.ota_provider,
                remaining_direct_billed: templateJob.remaining_direct_billed,
                total_collectable: templateJob.total_collectable,
                total_amount_confirmed: templateJob.total_amount_confirmed,
                execution_type: templateJob.execution_type,
                retries_attempted: templateJob.retries_attempted,
                max_retries: templateJob.max_retries,
                retry_delay_ms: templateJob.retry_delay_ms,
                priority: templateJob.priority,
                job_backoff_length_loading:
                  templateJob.job_backoff_length_loading,
                job_backoff_length_selector:
                  templateJob.job_backoff_length_selector,
                queue_name: templateJob.queue_name,
                worker_assigned: templateJob.worker_assigned,
                batch_execution_id: templateJob.batch_execution_id,
                start_date: startDate,
                end_date: endDate,
                log_link: templateJob.log_link,
                live_url: templateJob.live_url,
                watcher_emails: templateJob.watcher_emails,
                db_billing_duration: templateJob.db_billing_duration,
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

      // Update the recurring job
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
          // Extract current month from schedule date
          const currentMonth = scheduleDate.substring(0, 7); // YYYY-MM

          // Check if a job exists for this month
          const jobExists = await this.checkJobExistsInMonth(
            id,
            currentMonth,
          );

          if (!jobExists) {
            // Create a new job for this month
            const duration = recurringJob.duration ?? 1;
            const { startDate, endDate } = this.getDateRangeForDuration(
              scheduleDate,
              duration,
            );

            // Get existing jobs to use as template
            const jobs = await this.repository.findJobsByRecurringId(id);
            const templateJob = jobs[0];

            if (templateJob) {
              const newJob = await this.jobRepository.create({
                job_status: templateJob.job_status,
                portfolio_id: templateJob.portfolio_id,
                sub_portfolio_id: templateJob.sub_portfolio_id,
                property_id: templateJob.property_id,
                user_id: templateJob.user_id,
                recurring_id: id,
                posting_type: templateJob.posting_type,
                portfolio_name: templateJob.portfolio_name,
                sub_portfolio_name: templateJob.sub_portfolio_name,
                property_name: templateJob.property_name,
                billing_type: templateJob.billing_type,
                next_due_date: templateJob.next_due_date,
                schedule_date: scheduleDate,
                ota_provider: templateJob.ota_provider,
                remaining_direct_billed: templateJob.remaining_direct_billed,
                total_collectable: templateJob.total_collectable,
                total_amount_confirmed: templateJob.total_amount_confirmed,
                execution_type: templateJob.execution_type,
                retries_attempted: templateJob.retries_attempted,
                max_retries: templateJob.max_retries,
                retry_delay_ms: templateJob.retry_delay_ms,
                priority: templateJob.priority,
                job_backoff_length_loading:
                  templateJob.job_backoff_length_loading,
                job_backoff_length_selector:
                  templateJob.job_backoff_length_selector,
                queue_name: templateJob.queue_name,
                worker_assigned: templateJob.worker_assigned,
                batch_execution_id: templateJob.batch_execution_id,
                start_date: startDate,
                end_date: endDate,
                log_link: templateJob.log_link,
                live_url: templateJob.live_url,
                watcher_emails: templateJob.watcher_emails,
                db_billing_duration: templateJob.db_billing_duration,
                name: `${recurringJob.name} - ${startDate} to ${endDate}`,
              });

              // Add to scheduler
              await this.scheduledJobService.createOrUpdateScheduledJob(
                scheduleDate,
                [newJob.id],
              );

              this.logger.log(
                `Created new job ${newJob.id} for activated recurring job ${id}`,
              );
            } else {
              throw new BadRequestException(
                'No template job found for recurring job',
              );
            }
          } else {
            // Job exists, just add it to scheduler
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

      // Update the status
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

      // Get all jobs for this recurring job
      const jobs = await this.repository.findJobsByRecurringId(id);
      const jobIds = jobs.map((job) => job.id);

      // Remove all jobs from schedulers
      if (jobIds.length > 0) {
        await this.scheduledJobService.removeJobIdsFromAllScheduledJobs(
          jobIds,
        );
      }

      // Delete the recurring job (cascade will delete linked jobs)
      const deletedRecurringJob = await this.repository.delete(id);

      this.logger.log(`Deleted recurring job ${id} and its ${jobIds.length} jobs`);

      return deletedRecurringJob;
    } catch (error) {
      this.logger.error('Error deleting recurring job:', error);
      throw error;
    }
  }

  /**
   * Create next job for a recurring job based on duration (called after cron execution)
   * This method should be called by the cron scheduler after executing jobs
   */
  async createNextMonthJob(recurringId: string, currentScheduleDate: string): Promise<Job | null> {
    try {
      const recurringJob = await this.repository.findById(recurringId);

      if (!recurringJob || !recurringJob.is_active) {
        this.logger.warn(
          `Recurring job ${recurringId} not found or not active, skipping next job creation`,
        );
        return null;
      }

      const duration = recurringJob.duration ?? 1;

      // Calculate next schedule date by adding duration months
      const nextScheduleDate = this.getNextScheduleDate(
        currentScheduleDate,
        duration,
      );

      // Calculate date range based on duration
      const { startDate, endDate } = this.getDateRangeForDuration(
        nextScheduleDate,
        duration,
      );

      // Get existing jobs to use as template
      const jobs = await this.repository.findJobsByRecurringId(recurringId);
      const templateJob = jobs[0];

      if (!templateJob) {
        throw new BadRequestException('No template job found for recurring job');
      }

      // Create new job for next period
      const newJob = await this.jobRepository.create({
        job_status: templateJob.job_status,
        portfolio_id: templateJob.portfolio_id,
        sub_portfolio_id: templateJob.sub_portfolio_id,
        property_id: templateJob.property_id,
        user_id: templateJob.user_id,
        recurring_id: recurringId,
        posting_type: templateJob.posting_type,
        portfolio_name: templateJob.portfolio_name,
        sub_portfolio_name: templateJob.sub_portfolio_name,
        property_name: templateJob.property_name,
        billing_type: templateJob.billing_type,
        next_due_date: templateJob.next_due_date,
        schedule_date: nextScheduleDate,
        ota_provider: templateJob.ota_provider,
        remaining_direct_billed: templateJob.remaining_direct_billed,
        total_collectable: templateJob.total_collectable,
        total_amount_confirmed: templateJob.total_amount_confirmed,
        execution_type: templateJob.execution_type,
        retries_attempted: 0, // Reset retries for new job
        max_retries: templateJob.max_retries,
        retry_delay_ms: templateJob.retry_delay_ms,
        priority: templateJob.priority,
        job_backoff_length_loading: templateJob.job_backoff_length_loading,
        job_backoff_length_selector: templateJob.job_backoff_length_selector,
        queue_name: templateJob.queue_name,
        worker_assigned: templateJob.worker_assigned,
        batch_execution_id: templateJob.batch_execution_id,
        start_date: startDate,
        end_date: endDate,
        log_link: templateJob.log_link,
        live_url: templateJob.live_url,
        watcher_emails: templateJob.watcher_emails,
        db_billing_duration: templateJob.db_billing_duration,
        name: `${recurringJob.name} - ${startDate} to ${endDate}`,
      });

      // Add to scheduler
      await this.scheduledJobService.createOrUpdateScheduledJob(
        nextScheduleDate,
        [newJob.id],
      );

      this.logger.log(
        `Created next job ${newJob.id} for recurring job ${recurringId} with duration ${duration} months, scheduled for ${nextScheduleDate}, covering period ${startDate} to ${endDate}`,
      );

      return newJob;
    } catch (error) {
      this.logger.error('Error creating next month job:', error);
      throw error;
    }
  }
}
