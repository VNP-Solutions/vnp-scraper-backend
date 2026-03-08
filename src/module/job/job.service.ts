import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Batch, Job, OTAProvider, PostingType } from '@prisma/client';
import * as XLSX from 'xlsx';
import { IPropertyRepository } from '../property/property.interface';
import { IRecurringJobService } from '../recurring-job/recurring-job.interface';
import { IScheduledJobService } from '../scraper/scheduled-job.interface';
import {
  CreateBatchDto,
  CreateJobDto,
  JobStatisticsResponseDto,
  UpdateBatchDto,
  UpdateJobDto,
} from './job.dto';
import { IJobRepository, IJobService } from './job.interface';

@Injectable()
export class JobService implements IJobService {
  constructor(
    @Inject('IJobRepository')
    private readonly repository: IJobRepository,
    @Inject('IPropertyRepository')
    private readonly propertyRepository: IPropertyRepository,
    @Inject('IScheduledJobService')
    private readonly scheduledJobService: IScheduledJobService,
    @Inject('IRecurringJobService')
    private readonly recurringJobService: IRecurringJobService,
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
      const job = await this.repository.update(id, data);
      return job;
    } catch (error) {
      this.logger.error(`Error updating job: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteJob(id: string): Promise<Job> {
    try {
      const job = await this.repository.delete(id);
      return job;
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
}
