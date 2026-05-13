import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Batch, Job, OTAProvider, PostingType } from '@prisma/client';
import * as archiver from 'archiver';
import { PassThrough } from 'stream';
import * as XLSX from 'xlsx';
import { IRecurringJobService } from '../recurring-job/recurring-job.interface';
import { IScheduledJobService } from '../scraper/scheduled-job.interface';
import { IServerService } from '../server/server.interface';
import {
  CreateBatchDto,
  CreateJobDto,
  JobStatisticsResponseDto,
  UpdateBatchDto,
  UpdateJobDto,
} from './job.dto';
import { IJobRepository, IJobService } from './job.interface';
import {
  MASTER_EXPORT_HEADER,
  buildMasterRows,
} from './master-export.util';
import { triggerLambda } from '../../helpers/lambdaHelper';

@Injectable()
export class JobService implements IJobService {
  constructor(
    @Inject('IJobRepository')
    private readonly repository: IJobRepository,
    @Inject('IScheduledJobService')
    private readonly scheduledJobService: IScheduledJobService,
    @Inject('IRecurringJobService')
    private readonly recurringJobService: IRecurringJobService,
    @Inject('IServerService')
    private readonly serverService: IServerService,
    private readonly logger: Logger,
  ) {}

  private convertToPostingType(value: string): PostingType {
    if (!value) return PostingType.OTA;

    const normalizedValue = value.trim().toUpperCase();
    switch (normalizedValue) {
      case 'OTA':
        return PostingType.OTA;
      case 'OTA Post':
      case 'OTA_PLUS':
      case 'OTA PLUS':
        return PostingType.OTA_PLUS;
      default:
        return PostingType.OTA;
    }
  }

  private convertToOTAProvider(value: string): OTAProvider {
    if (!value) return OTAProvider.Expedia;

    const normalizedValue = value.trim();
    switch (normalizedValue) {
      case 'Expedia':
        return OTAProvider.Expedia;
      case 'Booking':
        return OTAProvider.Booking;
      case 'Agoda':
        return OTAProvider.Agoda;
      default:
        return OTAProvider.Expedia;
    }
  }

  async createJob(data: CreateJobDto): Promise<Job> {
    try {
      const job = await this.repository.create(data);
      return job;
    } catch (error) {
      this.logger.error(`Error creating job: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getAllJobs(
    query: Record<string, any>,
  ): Promise<{ data: Job[]; metadata: any }> {
    try {
      const result = await this.repository.findAll(query);
      // Normalize so log_link, failed_reason, screenshot_urls are always present (array/string for older docs)
      const data = (result.data || []).map((job: any) => ({
        ...job,
        log_link: job.log_link ?? null,
        failed_reason: job.failed_reason ?? '',
        screenshot_urls: Array.isArray(job.screenshot_urls)
          ? job.screenshot_urls
          : [],
      }));
      return { ...result, data };
    } catch (error) {
      this.logger.error(`Error getting jobs: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getJobById(id: string): Promise<Job> {
    try {
      const job = await this.repository.findById(id);
      if (!job) {
        throw new Error(`Job with ID ${id} not found`);
      }
      return job;
    } catch (error) {
      this.logger.error(`Error finding job: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateJob(id: string, data: UpdateJobDto): Promise<Job> {
    try {
      // Get the existing job to check if schedule_date is changing
      const existingJob = await this.repository.findById(id);
      
      if (!existingJob) {
        throw new Error(`Job with ID ${id} not found`);
      }
      
      // If schedule_date is being updated and job has a server assigned
      if (data.schedule_date && 
          existingJob.schedule_date && 
          data.schedule_date !== existingJob.schedule_date &&
          existingJob.server_id) {
        try {
          // Move job capacity from old date to new date
          await this.serverService.moveJobBetweenDates(
            existingJob.server_id,
            existingJob.schedule_date,
            data.schedule_date
          );
          this.logger.log(`Moved job ${id} capacity from ${existingJob.schedule_date} to ${data.schedule_date} on server ${existingJob.server_id}`);
        } catch (serverError) {
          this.logger.error(`Error moving job between dates: ${serverError.message}`, serverError.stack);
          // Don't throw - continue with job update even if server update fails
        }
      }
      
      const job = await this.repository.update(id, data);
      return job;
    } catch (error) {
      this.logger.error(`Error updating job: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteJob(id: string): Promise<Job> {
    try {
      // Get the job first to check if it has a server assigned
      const job = await this.repository.findById(id);
      
      if (job && job.server_id && job.schedule_date) {
        // Decrement the server's date-based capacity
        try {
          await this.serverService.decrementDateCapacity(job.server_id, job.schedule_date);
          this.logger.log(`Decremented date capacity for server ${job.server_id} on ${job.schedule_date} after deleting job ${id}`);
        } catch (serverError) {
          this.logger.error(`Error decrementing server date capacity: ${serverError.message}`, serverError.stack);
          // Don't throw - continue with job deletion even if server update fails
        }
      }
      
      const deletedJob = await this.repository.delete(id);
      return deletedJob;
    } catch (error) {
      this.logger.error(`Error deleting job: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Normalizes an Excel date value to MM/DD/YYYY string format.
   * Handles: JS Date objects, Excel serial numbers, 2-digit year strings, and already correct strings.
   */
  private normalizeExcelDate(value: any): string | null {
    if (value === null || value === undefined || value === '') return null;

    // If it's a JavaScript Date object (Excel date-formatted cells)
    if (value instanceof Date) {
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      const year = value.getFullYear();
      return `${month}/${day}/${year}`;
    }

    // If it's a number, treat as Excel serial date
    if (typeof value === 'number') {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + value * 86400000);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    }

    const str = value.toString().trim();
    if (!str) return null;

    // Handle 2-digit year: MM/DD/YY → MM/DD/YYYY
    const twoDigitYearMatch = str.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
    );
    if (twoDigitYearMatch) {
      const month = twoDigitYearMatch[1].padStart(2, '0');
      const day = twoDigitYearMatch[2].padStart(2, '0');
      const shortYear = parseInt(twoDigitYearMatch[3]);
      const year = shortYear >= 0 && shortYear <= 99 ? 2000 + shortYear : shortYear;
      return `${month}/${day}/${year}`;
    }

    // Handle M/D/YYYY or MM/DD/YYYY (pad single digit month/day)
    const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const month = slashMatch[1].padStart(2, '0');
      const day = slashMatch[2].padStart(2, '0');
      const year = slashMatch[3];
      return `${month}/${day}/${year}`;
    }

    // Return as-is for validation to catch
    return str;
  }

  /**
   * Helper function to parse scheduled date from various formats
   * Accepts: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, etc.
   */
  private parseScheduledDate(
    dateString: string | null | undefined,
  ): string | null {
    if (!dateString || dateString.toString().trim() === '') {
      return null;
    }

    const dateStr = dateString.toString().trim();

    // Check if already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }

    // Try to parse various date formats
    try {
      // Check if it matches MM/DD/YYYY or DD/MM/YYYY format
      const slashDatePattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
      const match = dateStr.match(slashDatePattern);
      
      if (match) {
        const first = parseInt(match[1], 10);
        const second = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        
        let month: number;
        let day: number;
        
        // Determine format: if first number > 12, it's DD/MM/YYYY
        // If second number > 12, it's MM/DD/YYYY
        // Otherwise, assume MM/DD/YYYY (US format)
        if (first > 12) {
          // DD/MM/YYYY format
          day = first;
          month = second;
        } else if (second > 12) {
          // MM/DD/YYYY format
          month = first;
          day = second;
        } else {
          // Ambiguous case (both <= 12): try MM/DD/YYYY first
          // If invalid date, try DD/MM/YYYY
          let testDate = new Date(year, first - 1, second);
          if (
            testDate.getFullYear() === year &&
            testDate.getMonth() === first - 1 &&
            testDate.getDate() === second
          ) {
            // Valid MM/DD/YYYY
            month = first;
            day = second;
          } else {
            // Try DD/MM/YYYY
            month = second;
            day = first;
          }
        }
        
        // Validate month and day
        if (month < 1 || month > 12 || day < 1 || day > 31) {
          return null;
        }
        
        // Create date to validate (handles invalid dates like Feb 30)
        const date = new Date(year, month - 1, day);
        if (
          date.getFullYear() === year &&
          date.getMonth() === month - 1 &&
          date.getDate() === day
        ) {
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      } else {
        // Try generic Date parsing for other formats (e.g., ISO, etc.)
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
      }
    } catch (error) {
      // If parsing fails, return null
    }

    return null;
  }

  async importJobsFromExcel(
    file: Express.Multer.File,
    userId: string,
  ): Promise<{
    jobsCreated: number;
    jobs: any[];
    scheduledJobsCreated: number;
    scheduledJobs: Array<{ date: string; jobIds: string[] }>;
    recurringJobsCreated: number;
    recurringJobs: any[];
  }> {
    try {
      if (!file.buffer) {
        throw new Error('File buffer is empty');
      }

      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const data = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        defval: '',
      });

      if (!data || data.length === 0) {
        throw new Error('Excel file is empty or invalid');
      }

      const headers = Object.keys(data[0] as any);

      this.logger.log(
        `Starting job import process for ${data.length} rows with headers: ${headers.join(', ')}`,
      );

      let jobsCreated = 0;
      const jobs: any[] = [];
      const scheduledJobsMap = new Map<string, string[]>();
      let recurringJobsCreated = 0;
      const recurringJobs: any[] = [];

      for (const row of data) {
        const rowData = row as any;

        try {
          let portfolioId = null;
          let subPortfolioId = null;
          let portfolioName = '';
          let subPortfolioName = '';

          if (rowData.Portfolio && rowData.Portfolio.trim() !== '') {
            portfolioName = rowData.Portfolio.toString().trim();
            const existingPortfolio =
              await this.repository.findPortfolioByName(portfolioName);

            if (!existingPortfolio) {
              throw new Error(
                `Portfolio '${portfolioName}' not found. Please create the portfolio first.`,
              );
            }
            portfolioId = existingPortfolio.id;
          }

          if (
            rowData['Sub Portfolio'] &&
            rowData['Sub Portfolio'].trim() !== ''
          ) {
            subPortfolioName = rowData['Sub Portfolio'].toString().trim();

            if (!portfolioId) {
              throw new Error(
                `Portfolio is required when specifying sub-portfolio '${subPortfolioName}'. Please include the Portfolio column.`,
              );
            }

            const existingSubPortfolio =
              await this.repository.findSubPortfolioByNameAndPortfolio(
                subPortfolioName,
                portfolioId,
              );

            if (!existingSubPortfolio) {
              throw new Error(
                `Sub-portfolio '${subPortfolioName}' not found under portfolio '${portfolioName}'. Please create the sub-portfolio first.`,
              );
            }
            subPortfolioId = existingSubPortfolio.id;
          }

          let propertyId = null;
          let propertyName = '';
          if (
            rowData['Property Name'] &&
            rowData['Property Name'].trim() !== ''
          ) {
            propertyName = rowData['Property Name'].toString().trim();
            const existingProperty =
              await this.repository.findPropertyByNameAndRelations(
                propertyName,
                portfolioId,
                subPortfolioId,
              );

            if (!existingProperty) {
              throw new Error(
                `Property '${propertyName}' not found. Please import the property first.`,
              );
            }
            propertyId = existingProperty.id;
          }

          let batchId = null;
          const batchColumn =
            rowData['Batch Name'] || rowData['Batch'] || rowData['Batch name'];
          if (batchColumn && batchColumn.trim() !== '') {
            const batchName = batchColumn.toString().trim();

            let existingBatch = await this.findBatchByName(batchName);

            if (existingBatch) {
              batchId = existingBatch.id;
              this.logger.log(
                `Using existing batch: ${batchName} (${batchId})`,
              );
            } else {
              const newBatch = await this.createBatch({ name: batchName });
              batchId = newBatch.id;
              this.logger.log(`Created new batch: ${batchName} (${batchId})`);
            }
          }

          const startDateRaw =
            rowData['From (MM/DD/YYYY)'] || rowData['Start Date'] || null;
          const endDateRaw =
            rowData['To (MM/DD/YYYY)'] || rowData['End Date'] || null;

          const startDate = this.normalizeExcelDate(startDateRaw);
          const endDate = this.normalizeExcelDate(endDateRaw);

          const mmddyyyyRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;

          if (startDate && !mmddyyyyRegex.test(startDate)) {
            throw new Error(
              `Invalid 'From' date format "${startDateRaw}" for job "${rowData['Job Name'] || `Job ${jobsCreated + 1}`}". Expected format: MM/DD/YYYY`,
            );
          }

          if (endDate && !mmddyyyyRegex.test(endDate)) {
            throw new Error(
              `Invalid 'To' date format "${endDateRaw}" for job "${rowData['Job Name'] || `Job ${jobsCreated + 1}`}". Expected format: MM/DD/YYYY`,
            );
          }

          const finalStartDate = startDate || endDate || null;
          const finalEndDate = endDate || startDate || null;

          // Parse Recurring Date and Duration columns
          const recurringDateColumn =
            rowData['Recurring Date'] ||
            rowData['Recurring'] ||
            rowData['Recurring Schedule Date'];
          const recurringDate = this.parseScheduledDate(recurringDateColumn);

          const durationColumn =
            rowData['Duration'] ||
            rowData['Recurring Duration'] ||
            rowData['Duration (Months)'];
          const duration = durationColumn
            ? parseInt(durationColumn.toString().trim())
            : 3;

          // If recurring date is provided, create a recurring job instead of a regular job
          if (recurringDate) {
            const recurringResult =
              await this.recurringJobService.createRecurringJob({
                name: rowData['Job Name'] || `Job ${jobsCreated + 1}`,
                job_status: rowData['Job Status'] || 'Pending',
                portfolio_id: portfolioId,
                sub_portfolio_id: subPortfolioId,
                property_id: propertyId,
                user_id: userId,
                posting_type: this.convertToPostingType(
                  rowData['Posting Type'],
                ),
                portfolio_name: portfolioName,
                sub_portfolio_name: subPortfolioName,
                property_name: propertyName,
                billing_type: (rowData['Billing Type'] || 'DB')
                  .toString()
                  .trim()
                  .toUpperCase(),
                next_due_date: rowData['Next Due Date']
                  ? new Date(rowData['Next Due Date'])
                  : undefined,
                schedule_date: recurringDate,
                ota_provider: rowData['Expedia ID']
                  ? OTAProvider.Expedia
                  : rowData['Booking ID']
                    ? OTAProvider.Booking
                    : rowData['Agoda ID']
                      ? OTAProvider.Agoda
                      : OTAProvider.Expedia,
                remaining_direct_billed: parseFloat(
                  rowData['Remaining Direct Billed'] || '0',
                ),
                total_collectable: parseFloat(
                  rowData['Total Collectable'] || '0',
                ),
                total_amount_confirmed: parseFloat(
                  rowData['Total Amount Confirmed'] || '0',
                ),
                execution_type: rowData['Execution Type'] || 'Immediate',
                retries_attempted: parseInt(
                  rowData['Retries Attempted'] || '0',
                ),
                max_retries: parseInt(rowData['Max Retries'] || '3'),
                retry_delay_ms: parseInt(rowData['Retry Delay MS'] || '5000'),
                priority: parseInt(rowData['Priority'] || '0'),
                job_backoff_length_loading: parseInt(
                  rowData['Job Backoff Length Loading'] || '50000',
                ),
                job_backoff_length_selector: parseInt(
                  rowData['Job Backoff Length Selector'] || '40000',
                ),
                queue_name: rowData['Queue Name'] || 'default',
                worker_assigned: rowData['Worker Assigned'] || null,
                batch_execution_id: rowData['Batch Execution ID'] || null,
                log_link: rowData['Log Link'] || null,
                live_url: rowData['Live URL'] || null,
                db_billing_duration: rowData['Billing Duration']
                  ? parseInt(rowData['Billing Duration'])
                  : null,
                watcher_emails: (() => {
                  const raw =
                    rowData['Watcher Emails'] ||
                    rowData['Watcher Email'] ||
                    null;
                  if (!raw) return [];
                  return raw
                    .toString()
                    .split(',')
                    .map((email: string) => email.trim())
                    .filter((email: string) => email);
                })(),
                duration: duration,
              });

            jobs.push(recurringResult.job);
            jobsCreated++;
            recurringJobs.push(recurringResult.recurringJob);
            recurringJobsCreated++;
            this.logger.log(
              `Created recurring job: ${recurringResult.recurringJob.name} (duration: ${duration} months) with first job: ${recurringResult.job.id}`,
            );
          } else {
            // Regular job creation (existing behavior)
            const jobData: CreateJobDto = {
              name: rowData['Job Name'] || `Job ${jobsCreated + 1}`,
              job_status: rowData['Job Status'] || 'Pending',
              portfolio_id: portfolioId,
              sub_portfolio_id: subPortfolioId,
              property_id: propertyId,
              user_id: userId,
              batch_id: batchId,
              posting_type: this.convertToPostingType(rowData['Posting Type']),
              portfolio_name: portfolioName,
              sub_portfolio_name: subPortfolioName,
              property_name: propertyName,
              billing_type: (rowData['Billing Type'] || 'DB')
                .toString()
                .trim()
                .toUpperCase(),
              next_due_date: rowData['Next Due Date']
                ? new Date(rowData['Next Due Date'])
                : undefined,
              ota_provider: rowData['Expedia ID']
                ? OTAProvider.Expedia
                : rowData['Booking ID']
                  ? OTAProvider.Booking
                  : rowData['Agoda ID']
                    ? OTAProvider.Agoda
                    : OTAProvider.Expedia,
              remaining_direct_billed: parseFloat(
                rowData['Remaining Direct Billed'] || '0',
              ),
              total_collectable: parseFloat(
                rowData['Total Collectable'] || '0',
              ),
              total_amount_confirmed: parseFloat(
                rowData['Total Amount Confirmed'] || '0',
              ),
              execution_type: rowData['Execution Type'] || 'Immediate',
              retries_attempted: parseInt(
                rowData['Retries Attempted'] || '0',
              ),
              max_retries: parseInt(rowData['Max Retries'] || '3'),
              retry_delay_ms: parseInt(rowData['Retry Delay MS'] || '5000'),
              priority: parseInt(rowData['Priority'] || '0'),
              job_backoff_length_loading: parseInt(
                rowData['Job Backoff Length Loading'] || '50000',
              ),
              job_backoff_length_selector: parseInt(
                rowData['Job Backoff Length Selector'] || '40000',
              ),
              queue_name: rowData['Queue Name'] || 'default',
              worker_assigned: rowData['Worker Assigned'] || null,
              batch_execution_id: rowData['Batch Execution ID'] || null,
              start_date: finalStartDate,
              end_date: finalEndDate,
              log_link: rowData['Log Link'] || null,
              live_url: rowData['Live URL'] || null,
              db_billing_duration: rowData['Billing Duration']
                ? parseInt(rowData['Billing Duration'])
                : null,
              watcher_emails: (() => {
                const raw =
                  rowData['Watcher Emails'] ||
                  rowData['Watcher Email'] ||
                  null;
                if (!raw) return [];
                return raw
                  .toString()
                  .split(',')
                  .map((email: string) => email.trim())
                  .filter((email: string) => email);
              })(),
            };

            // Handle Scheduled Date - optional field
            const scheduledDateColumn =
              rowData['Scheduled Date'] ||
              rowData['Scheduled'] ||
              rowData['Schedule Date'];
            const scheduledDate = this.parseScheduledDate(scheduledDateColumn);

            if (scheduledDate) {
              jobData.schedule_date = scheduledDate;
            }

            const newJob = await this.createJob(jobData);
            jobs.push(newJob);
            jobsCreated++;
            this.logger.log(`Created new job: ${newJob.name}`);

            if (scheduledDate) {
              if (!scheduledJobsMap.has(scheduledDate)) {
                scheduledJobsMap.set(scheduledDate, []);
              }
              scheduledJobsMap.get(scheduledDate)!.push(newJob.id);
              this.logger.log(
                `Job ${newJob.id} scheduled for date: ${scheduledDate}`,
              );
            }
          }
        } catch (error) {
          this.logger.error(`Error processing job row: ${error.message}`);
          throw error;
        }
      }

      this.logger.log(`Job import completed: ${jobsCreated} jobs created, ${recurringJobsCreated} recurring job(s) created`);

      // Create scheduled jobs for each date (only for non-recurring jobs)
      const scheduledJobs: Array<{ date: string; jobIds: string[] }> = [];
      let scheduledJobsCreated = 0;

      for (const [date, jobIds] of scheduledJobsMap.entries()) {
        try {
          this.logger.log(
            `Creating scheduled job for date ${date} with ${jobIds.length} job(s)`,
          );
          await this.scheduledJobService.createOrUpdateScheduledJob(
            date,
            jobIds,
            [],
          );
          scheduledJobs.push({ date, jobIds });
          scheduledJobsCreated++;
          this.logger.log(
            `Successfully created/updated scheduled job for date: ${date}`,
          );
        } catch (error) {
          this.logger.error(
            `Error creating scheduled job for date ${date}: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `Scheduled jobs creation completed: ${scheduledJobsCreated} scheduled job(s) created/updated`,
      );

      return {
        jobsCreated,
        jobs,
        scheduledJobsCreated,
        scheduledJobs,
        recurringJobsCreated,
        recurringJobs,
      };
    } catch (error) {
      this.logger.error(
        `Error importing jobs from Excel: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getLatestCheckoutDateByJobId(
    jobId: string,
  ): Promise<{ check_out_date: Date } | null> {
    try {
      const result = await this.repository.findLatestCheckoutDateByJobId(jobId);
      return result;
    } catch (error) {
      this.logger.error(
        `Error getting latest checkout date for job ${jobId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getJobStatistics(
    userId: string,
    userRole: string,
  ): Promise<JobStatisticsResponseDto> {
    try {
      const isAdmin = userRole === 'admin';
      const result = await this.repository.getJobStatisticsByUserId(
        userId,
        isAdmin,
      );

      this.logger.log(
        `Job statistics retrieved successfully for user ${userId} (role: ${userRole})`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Error getting job statistics for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // Batch service methods
  async createBatch(data: CreateBatchDto): Promise<Batch> {
    try {
      const batch = await this.repository.createBatch(data);
      return batch;
    } catch (error) {
      this.logger.error(`Error creating batch: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getAllBatches(query: Record<string, any>): Promise<Batch[]> {
    try {
      const batches = await this.repository.findAllBatches(query);
      return batches;
    } catch (error) {
      this.logger.error(`Error getting batches: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getBatchById(id: string): Promise<Batch> {
    try {
      const batch = await this.repository.findBatchById(id);
      if (!batch) {
        throw new Error(`Batch with ID ${id} not found`);
      }
      return batch;
    } catch (error) {
      this.logger.error(`Error finding batch: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findBatchByName(name: string): Promise<Batch | null> {
    try {
      const batch = await this.repository.findBatchByName(name);
      return batch;
    } catch (error) {
      this.logger.error(
        `Error finding batch by name: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateBatch(id: string, data: UpdateBatchDto): Promise<Batch> {
    try {
      const batch = await this.repository.updateBatch(id, data);
      return batch;
    } catch (error) {
      this.logger.error(`Error updating batch: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteBatch(id: string): Promise<Batch> {
    try {
      const batch = await this.repository.deleteBatch(id);
      return batch;
    } catch (error) {
      this.logger.error(`Error deleting batch: ${error.message}`, error.stack);
      // If error message indicates batch is in use, throw BadRequestException
      if (error.message && error.message.includes('Cannot delete batch')) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async bulkBatchUpdate(
    jobIds: string[],
    batchId: string,
  ): Promise<{ updatedCount: number; batch_id: string }> {
    try {
      if (!jobIds || jobIds.length === 0) {
        throw new Error('job_ids array cannot be empty');
      }

      if (!batchId) {
        throw new Error('batch_id is required');
      }

      const result = await this.repository.bulkBatchUpdate(jobIds, batchId);
      return {
        updatedCount: result.count,
        batch_id: batchId,
      };
    } catch (error) {
      this.logger.error(
        `Error bulk updating jobs batch: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async bulkArchiveUpdate(
    jobIds: string[],
    status: boolean,
  ): Promise<{ updatedCount: number; status: boolean }> {
    try {
      if (!jobIds || jobIds.length === 0) {
        throw new Error('job_ids array cannot be empty');
      }

      const result = await this.repository.bulkArchiveUpdate(jobIds, status);
      return {
        updatedCount: result.count,
        status: status,
      };
    } catch (error) {
      this.logger.error(
        `Error bulk updating jobs archive status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async bulkDeleteJobs(
    jobIds: string[],
  ): Promise<{ deletedCount: number; deletedJobIds: string[] }> {
    try {
      if (!jobIds || jobIds.length === 0) {
        throw new Error('job_ids array cannot be empty');
      }

      const result = await this.repository.bulkDelete(jobIds);
      return {
        deletedCount: result.count,
        deletedJobIds: result.deletedJobIds,
      };
    } catch (error) {
      this.logger.error(
        `Error bulk deleting jobs: ${error.message}`,
        error.stack,
      );
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
      if (!batchIds || batchIds.length === 0) {
        throw new Error('batch_ids array cannot be empty');
      }

      const result = await this.repository.bulkDeleteBatches(batchIds);
      return result;
    } catch (error) {
      this.logger.error(
        `Error bulk deleting batches: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async exportMasterCsv(
    jobIds: string[],
  ): Promise<{ buffer: Buffer; fileName: string }> {
    try {
      if (!Array.isArray(jobIds) || jobIds.length === 0) {
        throw new BadRequestException('job_ids array cannot be empty');
      }

      const uniqueJobIds = Array.from(new Set(jobIds));

      const jobs = await this.repository.findManyForMasterExport(uniqueJobIds);
      if (!jobs || jobs.length === 0) {
        throw new NotFoundException(
          `No jobs found for the given IDs: ${uniqueJobIds.join(', ')}`,
        );
      }

      const foundIds = new Set(jobs.map((j: any) => j.id));
      const missingIds = uniqueJobIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        this.logger.warn(
          `Master export: ${missingIds.length} job ID(s) not found and will be skipped: ${missingIds.join(', ')}`,
        );
      }

      // Build one CSV buffer per job, keyed by a per-job filename of the
      // form `{portfolio}-{property}.csv`. Jobs that produce no rows (no
      // jobItem records) are skipped. Filename collisions are disambiguated
      // with a numeric suffix so no entry overwrites another in the zip.
      const usedNames = new Set<string>();
      const csvEntries: Array<{ name: string; data: Buffer }> = [];

      for (const job of jobs) {
        const { headers, rows } = buildMasterRows([job]);
        if (rows.length === 0) continue;

        const csvBuffer = this.buildMasterCsvBuffer(rows, headers);
        const csvName = this.ensureUniqueFilename(
          `${this.buildJobCsvBaseName(job)}.csv`,
          usedNames,
        );
        csvEntries.push({ name: csvName, data: csvBuffer });
      }

      if (csvEntries.length === 0) {
        throw new NotFoundException(
          'No job items found for the given jobs to export',
        );
      }

      const zipBuffer = await this.zipFiles(csvEntries);
      const fileName = `${this.buildMasterZipBaseName(jobs)}.zip`;

      return { buffer: zipBuffer, fileName };
    } catch (error) {
      this.logger.error(
        `Error exporting master CSV zip: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async exportSingleJobMasterCsv(
    jobId: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    try {
      if (!jobId) {
        throw new BadRequestException('jobId is required');
      }

      const jobs = await this.repository.findManyForMasterExport([jobId]);
      if (!jobs || jobs.length === 0) {
        throw new NotFoundException(`Job not found for id: ${jobId}`);
      }

      const job = jobs[0];
      const { headers, rows } = buildMasterRows([job]);
      if (rows.length === 0) {
        throw new NotFoundException(
          `No job items found for job ${jobId} to export`,
        );
      }

      const buffer = this.buildMasterCsvBuffer(rows, headers);
      // Filename format: "{OTA}-{property}-{startDate}-{endDate}.csv"
      // (same as the inner CSVs produced by POST /jobs/export-master).
      const fileName = `${this.buildJobCsvBaseName(job)}.csv`;

      return { buffer, fileName };
    } catch (error) {
      this.logger.error(
        `Error exporting single job master CSV: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Resolves all jobs in a recurring report bucket (by recurring_id +
   * recurring_report_bucket_id) and runs them through the regular master
   * export pipeline. The frontend can hit this with the same two filters
   * it already uses on the jobs list, and gets back the same ZIP-of-CSVs
   * as POST /jobs/export-master.
   */
  async exportMasterCsvByRecurring(
    recurringId: string,
    bucketId: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    try {
      if (!recurringId || !bucketId) {
        throw new BadRequestException(
          'Both recurring_id and recurring_report_bucket_id are required',
        );
      }

      const jobIds = await this.repository.findJobIdsByRecurring(
        recurringId,
        bucketId,
      );

      if (jobIds.length === 0) {
        throw new NotFoundException(
          `No jobs found for recurring_id=${recurringId}, recurring_report_bucket_id=${bucketId}`,
        );
      }

      return this.exportMasterCsv(jobIds);
    } catch (error) {
      this.logger.error(
        `Error exporting master CSV by recurring: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private buildMasterCsvBuffer(
    rows: Record<string, any>[],
    headers: string[] = MASTER_EXPORT_HEADER,
  ): Buffer {
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: headers,
    });
    // Prefix UTF-8 BOM so Excel opens the file correctly (accents, the
    // ="..." text-formula trick for card numbers, etc.).
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    return Buffer.from('\uFEFF' + csv, 'utf8');
  }

  private buildJobCsvBaseName(job: any): string {
    const ota = this.sanitizeForFilename(
      (job?.ota_provider ?? '').toString() || 'OTA',
    );
    const property = this.sanitizeForFilename(
      job?.property_name ?? job?.property?.name ?? 'property',
    );
    const startDate = this.formatDateForFilename(job?.start_date);
    const endDate = this.formatDateForFilename(job?.end_date);
    return `${ota}-${property}-${startDate}-${endDate}`;
  }

  private buildMasterZipBaseName(_jobs: any[]): string {
    return `job-exports-${this.buildHumanReadableTimestamp()}`;
  }

  private buildHumanReadableTimestamp(d: Date = new Date()): string {
    // Produces e.g. "23 April 2026-04.44 PM". A dot is used as the time
    // separator instead of ":" so the filename is valid on every OS
    // (Windows / macOS / Linux all disallow or rewrite ":" in filenames,
    // while "." is always safe and visually very close to a colon).
    const day = d.getDate();
    const month = d.toLocaleString('en-US', { month: 'long' });
    const year = d.getFullYear();
    const time = d
      .toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      .replace(':', '.');
    return `${day} ${month} ${year}-${time}`;
  }

  private formatDateForFilename(value: string | null | undefined): string {
    const raw = (value ?? '').toString().trim();
    if (!raw) return 'NA';
    // Job start_date / end_date are stored as strings like "MM/DD/YYYY".
    // Replace path/whitespace separators with "-" so the filename stays
    // readable instead of turning the slashes into underscores.
    return raw.replace(/[\/\\:*?"<>|\s]+/g, '-');
  }

  private sanitizeForFilename(value: string): string {
    const cleaned = (value ?? '')
      .toString()
      .trim()
      .replace(/[\/\\:*?"<>|\x00-\x1f]+/g, '_')
      .replace(/\s+/g, ' ');
    return cleaned.length > 0 ? cleaned : 'unknown';
  }

  private ensureUniqueFilename(name: string, used: Set<string>): string {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    const dot = name.lastIndexOf('.');
    const base = dot >= 0 ? name.slice(0, dot) : name;
    const ext = dot >= 0 ? name.slice(dot) : '';
    let counter = 2;
    let candidate = `${base}-${counter}${ext}`;
    while (used.has(candidate)) {
      counter += 1;
      candidate = `${base}-${counter}${ext}`;
    }
    used.add(candidate);
    return candidate;
  }

  private zipFiles(
    files: Array<{ name: string; data: Buffer }>,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      const sink = new PassThrough();

      sink.on('data', (chunk: Buffer) => chunks.push(chunk));
      sink.on('end', () => resolve(Buffer.concat(chunks)));
      sink.on('error', reject);
      archive.on('error', reject);
      archive.on('warning', (err: any) => {
        if (err?.code === 'ENOENT') {
          this.logger.warn(`archiver warning: ${err.message}`);
        } else {
          reject(err);
        }
      });

      archive.pipe(sink);
      for (const file of files) {
        archive.append(file.data, { name: file.name });
      }
      void archive.finalize();
    });
  }

  async getDbEntriesByJobId(jobId: string): Promise<any[]> {
    try {
      const dbEntries = await this.repository.findDbEntriesByJobId(jobId);

      // Transform the response to include gearbox_queue_ids and portfolio_name as flat properties
      return dbEntries.map((entry: any) => {
        const gearboxQueueIds = entry.dbData?.gearbox_queue_ids || [];
        const portfolioName = entry.job?.portfolio_name || null;

        // Remove dbData from the response and add gearbox_queue_ids and portfolio_name as flat properties
        const { dbData, ...entryWithoutDbData } = entry;
        return {
          ...entryWithoutDbData,
          gearbox_queue_ids: gearboxQueueIds,
          portfolio_name: portfolioName,
        };
      });
    } catch (error) {
      this.logger.error(
        `Error getting DbEntry by job ID: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async triggerLambdaForPlatform(platform: string): Promise<void> {
    try {
      await triggerLambda(platform);
      this.logger.log(`Lambda triggered successfully for platform: ${platform}`);
    } catch (error) {
      this.logger.error(
        `Error triggering Lambda for platform ${platform}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

}
