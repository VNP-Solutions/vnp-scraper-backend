import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IPropertyRepository,
  IPropertyService,
} from '../property/property.interface';
import { Batch, Job, JobStatus, OTAProvider, PostingType } from '@prisma/client';
import * as archiver from 'archiver';
import { PassThrough, Writable } from 'stream';
import * as XLSX from 'xlsx';
import { streamZipEntries } from '../../common/utils/zip-and-filename.util';
import { IRecurringJobService } from '../recurring-job/recurring-job.interface';
import { IScheduledJobService } from '../scraper/scheduled-job.interface';
import { IServerService } from '../server/server.interface';
import {
  BulkCreateJobFromDbmsItemDto,
  BulkCreateJobFromDbmsResultDto,
  CreateBatchDto,
  CreateJobDto,
  JobStatisticsResponseDto,
  UpdateBatchDto,
  UpdateJobDto,
} from './job.dto';
import { IJobRepository, IJobService } from './job.interface';
import type { JobListItem } from './job-list.types';
import {
  MASTER_EXPORT_HEADER,
  buildMasterExportContextFromPrescan,
  buildMasterRows,
  buildMasterXlsxBuffer,
} from './master-export.util';
import {
  writeMasterXlsxToStream,
  writePerJobXlsxToWritable,
} from './master-export-stream.util';
import {
  buildDashboardRows,
  buildDashboardXlsxBuffer,
} from './dashboard-export.util';
import { writeDashboardXlsxToStream } from './dashboard-export-stream.util';
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
    @Inject('IPropertyService')
    private readonly propertyService: IPropertyService,
    @Inject('IPropertyRepository')
    private readonly propertyRepository: IPropertyRepository,
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

  /**
   * DBMS→scraper sync receiver. Resolves each property by parent_id and
   * creates a job with system defaults. Per-row reporting: one failing row
   * does not abort the batch. Jobs are always created (no dedup).
   */
  async bulkCreateFromDbms(
    items: BulkCreateJobFromDbmsItemDto[],
  ): Promise<BulkCreateJobFromDbmsResultDto> {
    if (!Array.isArray(items) || !items.length) {
      throw new BadRequestException('No jobs provided');
    }

    const result: BulkCreateJobFromDbmsResultDto = {
      totalCount: items.length,
      createdCount: 0,
      failureCount: 0,
      errors: [],
      created: [],
    };

    // Jobs require a user_id (FK to User); DBMS sync has no user, so reuse
    // the shared "DBMS Section" system user resolved once for the batch.
    const userId = await this.recurringJobService.resolveDbmsSystemUser();

    for (const item of items) {
      const parentId =
        typeof item.parent_id === 'string' ? item.parent_id.trim() : '';
      try {
        if (!parentId) throw new Error('parent_id is required');

        const property = await this.propertyRepository.findByParentId(parentId);
        if (!property) {
          throw new Error(`Property not found with parent_id: ${parentId}`);
        }

        const job = await this.repository.create({
          user_id: userId,
          property_id: property.id,
          property_name: property.name,
          posting_type: PostingType.OTA,
          ota_provider: this.mapOtaType(item.ota_type),
          billing_type: (item.billing_type ?? '').trim() || undefined,
          start_date: item.start_date,
          end_date: item.end_date,
          execution_type: 'scheduled',
          remaining_direct_billed: 0,
          total_collectable: 0,
          total_amount_confirmed: 0,
          job_backoff_length_loading: 50000,
          job_backoff_length_selector: 40000,
          max_retries: 3,
          retry_delay_ms: 5000,
          priority: 0,
          queue_name: 'default',
          job_status: JobStatus.Pending,
        } as CreateJobDto);

        result.createdCount++;
        result.created.push({ parent_id: parentId, job_id: job.id });
      } catch (error) {
        result.errors.push({
          parent_id: parentId || 'Unknown',
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
        });
        result.failureCount++;
      }
    }

    return result;
  }

  private mapOtaType(otaType: string): OTAProvider {
    switch ((otaType ?? '').trim().toLowerCase()) {
      case 'expedia':
        return OTAProvider.Expedia;
      case 'booking':
        return OTAProvider.Booking;
      case 'agoda':
        return OTAProvider.Agoda;
      default:
        throw new Error(`Unsupported ota_type: ${otaType}`);
    }
  }

  async getAllJobs(
    query: Record<string, any>,
  ): Promise<{ data: JobListItem[]; metadata: any }> {
    try {
      const result = await this.repository.findAll(query);
      // Normalize so log_link, failed_reason, screenshot_urls are always present (array/string for older docs)
      const data: JobListItem[] = (result.data || []).map((job: any) => {
        if (job?.property) {
          this.propertyService.applyPropertyCredentialsShape(job.property);
        }
        return {
          ...job,
          log_link: job.log_link ?? null,
          failed_reason: job.failed_reason ?? '',
          screenshot_urls: Array.isArray(job.screenshot_urls)
            ? job.screenshot_urls
            : [],
        };
      });
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

  /**
   * Consolidated XLSX export — every (job, jobItem) row from the given
   * jobIds rendered into ONE workbook with a single "Master" sheet.
   *
   * Uses the exact same headers and per-OTA logic as the per-job CSV
   * (`buildMasterRows`) so the columns line up byte-for-byte with what
   * `/jobs/export-master` produces — the only difference is that here all
   * jobs share one sheet instead of one CSV/XLSX per job.
   *
   * Notes on mixed-OTA inputs:
   * - If ANY job in the input is Expedia, the Expedia-specific columns
   *   (`Card Activity`, `Calculated Amount to Charge`, `Amount Match`, and
   *   `Card Activity Approved Amount N`) are appended to the header.
   *   Non-Expedia rows simply leave those cells blank — exactly how the
   *   underlying `buildMasterRow` function already behaves.
   * - `Over 160` / `Number of days since chargeback date` use "N/A" for
   *   Booking rows (no check-out date) on every row, regardless of the
   *   other jobs in the workbook.
   *
   * Filename:
   *   `consolidated-report-{D Month YYYY-HH.MM AM/PM}.xlsx`
   *   (e.g. `consolidated-report-19 May 2026-05.30 PM.xlsx`).
   *
   * Errors:
   * - `BadRequestException` if `jobIds` is empty after dedupe.
   * - `NotFoundException` if none of the IDs match a job, or if the
   *   matching jobs collectively have no job items to export.
   */
  async buildConsolidatedMasterXlsx(
    jobIds: string[],
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const startedAt = Date.now();
    try {
      const uniqueJobIds = Array.from(new Set(jobIds ?? [])).filter(Boolean);
      if (uniqueJobIds.length === 0) {
        throw new BadRequestException('At least one job ID is required');
      }

      this.logger.log(
        `[Consolidated XLSX] Sync build started for ${uniqueJobIds.length} job ID(s)`,
      );

      const dbLoadStartedAt = Date.now();
      const jobs = await this.repository.findManyForMasterExport(uniqueJobIds);
      this.logger.log(
        `[Consolidated XLSX] DB load finished in ${Date.now() - dbLoadStartedAt}ms`,
      );

      if (!jobs || jobs.length === 0) {
        throw new NotFoundException(
          `No jobs found for the given IDs: ${uniqueJobIds.join(', ')}`,
        );
      }

      const foundIds = new Set(jobs.map((j: any) => j.id));
      const missingIds = uniqueJobIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        this.logger.warn(
          `[Consolidated XLSX] ${missingIds.length} job ID(s) not found and will be skipped: ${missingIds.join(', ')}`,
        );
      }

      const rowsStartedAt = Date.now();
      const { rows } = buildMasterRows(jobs);
      this.logger.log(
        `[Consolidated XLSX] Row build finished in ${Date.now() - rowsStartedAt}ms — ` +
          `${rows.length} export row(s) from ${jobs.length} job(s)`,
      );

      if (rows.length === 0) {
        throw new NotFoundException(
          'No job items found for the provided job IDs to export',
        );
      }

      const xlsxStartedAt = Date.now();
      const buffer = buildMasterXlsxBuffer(jobs);
      this.logger.log(
        `[Consolidated XLSX] XLSX buffer built in ${Date.now() - xlsxStartedAt}ms — ` +
          `${buffer.length} bytes`,
      );

      const fileName = `consolidated-report-${this.buildHumanReadableTimestamp()}.xlsx`;
      this.logger.log(
        `[Consolidated XLSX] Sync build complete in ${Date.now() - startedAt}ms — ${fileName}`,
      );
      return { buffer, fileName };
    } catch (error) {
      this.logger.error(
        `Error building consolidated master XLSX: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Dashboard XLSX export — every (job, jobItem) row from the provided
   * jobIds rendered into one workbook with a single "Dashboard" sheet,
   * using the simplified dashboard column spec defined in
   * `dashboard-export.util.ts`.
   *
   * Per-row business rules of note:
   * - `Hotel ID` is the OTA-specific property ID (Expedia → `expedia_id`,
   *   Booking → `booking_id`, Agoda → `agoda_id`) — chosen per job's
   *   `ota_provider`.
   * - `Due To Property` / `Due To VNP` are an 85 / 15 split of
   *   `payment_info.amount_to_charge_or_refund`, rounded to 4 decimals,
   *   applied ONLY for Expedia / Booking rows where a numeric amount is
   *   present. Anything else (Agoda, missing amount, non-numeric) →
   *   `"N/A"` on both columns.
   * - `Status` is hard-coded to the literal string `"TBD"` pending a
   *   source-of-truth decision (see `buildDashboardRow`).
   *
   * Filename: `dashboard-report-{D Month YYYY-HH.MM AM/PM}.xlsx`.
   *
   * Errors:
   * - `BadRequestException` if `jobIds` is empty after dedupe.
   * - `NotFoundException` if no jobs match the IDs, or if the matching
   *   jobs collectively have no items.
   */
  async buildDashboardXlsx(
    jobIds: string[],
  ): Promise<{ buffer: Buffer; fileName: string }> {
    try {
      const uniqueJobIds = Array.from(new Set(jobIds ?? [])).filter(Boolean);
      if (uniqueJobIds.length === 0) {
        throw new BadRequestException('At least one job ID is required');
      }

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
          `Dashboard XLSX: ${missingIds.length} job ID(s) not found and will be skipped: ${missingIds.join(', ')}`,
        );
      }

      // Re-use `buildDashboardRows` for the empty-detection check so we
      // only throw 404 once we've confirmed every matching job has zero
      // exportable items.
      const { rows } = buildDashboardRows(jobs);
      if (rows.length === 0) {
        throw new NotFoundException(
          'No job items found for the provided job IDs to export',
        );
      }

      const buffer = buildDashboardXlsxBuffer(jobs);
      const fileName = `dashboard-report-${this.buildHumanReadableTimestamp()}.xlsx`;
      return { buffer, fileName };
    } catch (error) {
      this.logger.error(
        `Error building dashboard XLSX: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Same source data + filename rules as `exportMasterCsv`, but produces
   * an XLSX buffer per job instead of CSV and returns the individual
   * entries without zipping them. Reports' combined export endpoint uses
   * this so it can mix job XLSXs with retrieval XLSXs in a single ZIP.
   */
  async buildMasterXlsxEntries(
    jobIds: string[],
  ): Promise<Array<{ name: string; data: Buffer }>> {
    try {
      const uniqueJobIds = Array.from(new Set(jobIds ?? []));
      if (uniqueJobIds.length === 0) return [];

      const jobs = await this.repository.findManyForMasterExport(uniqueJobIds);
      if (!jobs || jobs.length === 0) return [];

      const foundIds = new Set(jobs.map((j: any) => j.id));
      const missingIds = uniqueJobIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        this.logger.warn(
          `Master XLSX entries: ${missingIds.length} job ID(s) not found and will be skipped: ${missingIds.join(', ')}`,
        );
      }

      const usedNames = new Set<string>();
      const entries: Array<{ name: string; data: Buffer }> = [];
      for (const job of jobs) {
        const { rows } = buildMasterRows([job]);
        if (rows.length === 0) continue;

        const xlsxBuffer = buildMasterXlsxBuffer([job]);
        const xlsxName = this.ensureUniqueFilename(
          `${this.buildJobCsvBaseName(job)}.xlsx`,
          usedNames,
        );
        entries.push({ name: xlsxName, data: xlsxBuffer });
      }
      return entries;
    } catch (error) {
      this.logger.error(
        `Error building master XLSX entries: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Streaming counterpart to {@link buildConsolidatedMasterXlsx}. Writes
   * the consolidated XLSX directly into the provided `writable` using
   * `ExcelJS.stream.xlsx.WorkbookWriter` — fed by a Mongo cursor
   * generator instead of an in-memory `jobs[]` array.
   *
   * Pipeline (the "true streaming" pattern, end to end):
   *
   *   Mongo cursor (batch=20)
   *      ─▶  AsyncGenerator yields one Job at a time
   *           ─▶  writeMasterXlsxToStream consumes via `for await`
   *                ─▶  ExcelJS.WorkbookWriter commits rows to a PassThrough
   *                     ─▶  S3 multipart Upload flushes parts as bytes arrive
   *
   * Peak heap during the entire pipeline is roughly:
   *   ~one Mongo batch + ~one in-flight job's rows + ~ExcelJS HWM + ~S3 part queue
   *   ≈ 100 MB, INDEPENDENT of total job count.
   *
   * Powers the async export path (> 10 jobs) where the writable is a
   * `PassThrough` piped into S3's multipart `Upload`. The buffer variant
   * (`buildConsolidatedMasterXlsx`) is kept for the sync path because
   * its HTTP caller wants a known `Content-Length`.
   */
  async streamConsolidatedMasterXlsx(
    jobIds: string[],
    writable: Writable,
  ): Promise<{ fileName: string }> {
    const startedAt = Date.now();
    try {
      const uniqueJobIds = Array.from(new Set(jobIds ?? [])).filter(Boolean);
      if (uniqueJobIds.length === 0) {
        throw new BadRequestException('At least one job ID is required');
      }
      this.logger.log(
        `[Consolidated XLSX] Starting build for ${uniqueJobIds.length} job IDs`,
      );

      // Step 1: lightweight pre-scan. Tells us whether to emit Expedia-only
      // columns, how many Approved Amount K columns the workbook needs,
      // and which IDs actually exist in Mongo. NO row data loaded yet.
      const prescan =
        await this.repository.precomputeMasterExportContext(uniqueJobIds);

      if (prescan.foundIds.size === 0) {
        throw new NotFoundException(
          `No jobs found for the given IDs: ${uniqueJobIds.join(', ')}`,
        );
      }
      const missingIds = uniqueJobIds.filter(
        (id) => !prescan.foundIds.has(id),
      );
      if (missingIds.length > 0) {
        this.logger.warn(
          `[Consolidated XLSX] ${missingIds.length} job ID(s) not found and will be skipped: ${missingIds.join(', ')}`,
        );
      }

      // Step 2: cheap empty-check via a Mongo `count`. We do this BEFORE
      // opening the S3 multipart upload so a "nothing to export" call
      // returns 404 without leaving an orphaned upload behind.
      const totalItemRows =
        await this.repository.countJobItemsByJobIds(uniqueJobIds);
      if (totalItemRows === 0) {
        throw new NotFoundException(
          'No job items found for the provided job IDs to export',
        );
      }
      this.logger.log(
        `[Consolidated XLSX] Building XLSX with ${totalItemRows} rows across ` +
          `${prescan.foundIds.size} jobs (hasExpedia=${prescan.hasExpedia}, ` +
          `maxApproved=${prescan.maxApprovedCount})`,
      );

      // Step 3: hand the writer a precomputed context (headers + Expedia
      // flag + max-approved) and a cursor — the writer never sees an
      // array of jobs, so it can't accidentally pin them all in memory.
      const ctx = buildMasterExportContextFromPrescan(prescan);
      const jobCursor = this.repository.streamJobsForMasterExport(
        uniqueJobIds,
        20,
      );

      const buildStartedAt = Date.now();
      await writeMasterXlsxToStream(jobCursor, ctx, writable);
      this.logger.log(
        `[Consolidated XLSX] XLSX write+stream complete in ${Date.now() - buildStartedAt}ms ` +
          `(total ${Date.now() - startedAt}ms incl. pre-scan)`,
      );

      const fileName = `consolidated-report-${this.buildHumanReadableTimestamp()}.xlsx`;
      return { fileName };
    } catch (error) {
      this.logger.error(
        `Error streaming consolidated XLSX: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Streaming counterpart to {@link buildDashboardXlsx}. Same cursor-
   * driven pipeline as {@link streamConsolidatedMasterXlsx} — see that
   * method's docs for the end-to-end memory profile.
   *
   * The dashboard has a completely static column shape (no Expedia-only
   * columns, no per-batch aggregates), so we don't need the full master
   * pre-scan — just enough to validate which IDs exist and to throw 404
   * on an empty export.
   */
  async streamDashboardXlsx(
    jobIds: string[],
    writable: Writable,
  ): Promise<{ fileName: string }> {
    const startedAt = Date.now();
    try {
      const uniqueJobIds = Array.from(new Set(jobIds ?? [])).filter(Boolean);
      if (uniqueJobIds.length === 0) {
        throw new BadRequestException('At least one job ID is required');
      }
      this.logger.log(
        `[Dashboard XLSX] Starting build for ${uniqueJobIds.length} job IDs`,
      );

      // Reuse the master pre-scan — it returns `foundIds` and is cheap
      // (one `{ id, ota_provider }` projection; max-approved scan is
      // skipped when no Expedia jobs are present). The dashboard
      // ignores the Expedia / approved-count fields it returns.
      const prescan =
        await this.repository.precomputeMasterExportContext(uniqueJobIds);

      if (prescan.foundIds.size === 0) {
        throw new NotFoundException(
          `No jobs found for the given IDs: ${uniqueJobIds.join(', ')}`,
        );
      }
      const missingIds = uniqueJobIds.filter(
        (id) => !prescan.foundIds.has(id),
      );
      if (missingIds.length > 0) {
        this.logger.warn(
          `[Dashboard XLSX] ${missingIds.length} job ID(s) not found and will be skipped: ${missingIds.join(', ')}`,
        );
      }

      const totalItemRows =
        await this.repository.countJobItemsByJobIds(uniqueJobIds);
      if (totalItemRows === 0) {
        throw new NotFoundException(
          'No job items found for the provided job IDs to export',
        );
      }
      this.logger.log(
        `[Dashboard XLSX] Building XLSX with ${totalItemRows} rows across ${prescan.foundIds.size} jobs`,
      );

      const jobCursor = this.repository.streamJobsForMasterExport(
        uniqueJobIds,
        20,
      );

      const buildStartedAt = Date.now();
      await writeDashboardXlsxToStream(jobCursor, writable);
      this.logger.log(
        `[Dashboard XLSX] XLSX write+stream complete in ${Date.now() - buildStartedAt}ms ` +
          `(total ${Date.now() - startedAt}ms incl. pre-scan)`,
      );

      const fileName = `dashboard-report-${this.buildHumanReadableTimestamp()}.xlsx`;
      return { fileName };
    } catch (error) {
      this.logger.error(
        `Error streaming dashboard XLSX: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Streaming counterpart to {@link buildMasterXlsxEntries} + the
   * `zipFiles` Buffer helper. Builds one XLSX per job, appends each
   * into a streaming ZIP, and writes the ZIP bytes directly into the
   * provided `writable`.
   *
   * Cursor-driven memory profile: jobs flow in one at a time from a
   * Mongo async generator, each is turned into its own small XLSX
   * buffer (~tens of KB to a few hundred KB), the buffer is appended
   * to archiver, then GC reclaims the row array. We never hold the
   * `jobs[]` array in memory — that was the bottleneck for large
   * exports under the old implementation.
   *
   * Why we still buffer each per-job XLSX instead of piping a
   * `WorkbookWriter` straight into archiver: the per-job payload is
   * small, and buffering it lets us append with a known size —
   * significantly simpler than juggling N parallel `PassThrough`
   * streams. The bounded memory is per-job, not per-export.
   */
  async streamMasterXlsxZip(
    jobIds: string[],
    writable: Writable,
  ): Promise<{ fileName: string }> {
    const startedAt = Date.now();
    try {
      const uniqueJobIds = Array.from(new Set(jobIds ?? [])).filter(Boolean);
      if (uniqueJobIds.length === 0) {
        throw new BadRequestException('At least one job ID is required');
      }
      this.logger.log(
        `[Master ZIP] Starting build for ${uniqueJobIds.length} job IDs`,
      );

      // Pre-flight: validate IDs exist + count items. Per-job ZIP files
      // compute their own column headers from a single job, so we must
      // NOT call precomputeMasterExportContext here — that method scans
      // all Expedia authorizations across the full batch (15–30+ min on
      // 900+ jobs) even though this export never uses the result.
      const foundIds =
        await this.repository.findExistingJobIdsForExport(uniqueJobIds);
      if (foundIds.size === 0) {
        throw new NotFoundException(
          `No jobs found for the given IDs: ${uniqueJobIds.join(', ')}`,
        );
      }
      const missingIds = uniqueJobIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        this.logger.warn(
          `[Master ZIP] ${missingIds.length} job ID(s) not found and will be skipped: ${missingIds.join(', ')}`,
        );
      }

      const totalItemRows =
        await this.repository.countJobItemsByJobIds(uniqueJobIds);
      if (totalItemRows === 0) {
        throw new NotFoundException(
          'No job items found for the provided job IDs to export',
        );
      }
      this.logger.log(
        `[Master ZIP] Building ZIP for ${foundIds.size} jobs ` +
          `(${totalItemRows} item rows total)`,
      );

      // Cursor-driven per-job iteration. For each job we:
      //   1. Do a fast CPU check (buildMasterRows) to skip empty jobs.
      //   2. Create a PassThrough and hand it to archiver as a stream entry.
      //   3. Concurrently write the XLSX via ExcelJS into that PassThrough.
      //
      // archiver reads bytes from the PassThrough and compresses them
      // in real time — no full XLSX buffer is ever held in heap. Peak
      // memory per entry: ExcelJS worksheet state (~2–5 MB) + archiver
      // compression window (~256 KB). Compression level = 1 (fastest).
      const buildStartedAt = Date.now();
      const totalJobs = foundIds.size;
      const logEveryNJobs = Math.max(1, Math.ceil(totalJobs / 20));
      const usedNames = new Set<string>();
      let entryCount = 0;
      let jobsProcessed = 0;
      await streamZipEntries(writable, async ({ appendStream }) => {
        for await (const job of this.repository.streamJobsForMasterExport(
          uniqueJobIds,
          20,
        )) {
          jobsProcessed += 1;

          // Fast CPU check — no I/O. Skip jobs with no items so we never
          // produce a header-only XLSX entry inside the ZIP.
          const { rows: checkRows } = buildMasterRows([job]);
          if (checkRows.length === 0) {
            if (jobsProcessed % logEveryNJobs === 0) {
              this.logger.log(
                `[Master ZIP] ${jobsProcessed}/${totalJobs} jobs processed ` +
                  `(${Math.round((jobsProcessed / totalJobs) * 100)}%, ` +
                  `${entryCount} entries written)`,
              );
            }
            continue;
          }

          const xlsxName = this.ensureUniqueFilename(
            `${this.buildJobCsvBaseName(job)}.xlsx`,
            usedNames,
          );

          // True streaming: ExcelJS writes XLSX bytes into `pt` while
          // archiver reads from `pt` and compresses concurrently.
          // `appendStream` resolves only after archiver emits 'entry'
          // (entry fully flushed to the output), so the next job doesn't
          // start until the current one is completely done.
          const pt = new PassThrough();
          await Promise.all([
            appendStream(xlsxName, pt),
            writePerJobXlsxToWritable(job, pt).catch((err: Error) => {
              pt.destroy(err);
              throw err;
            }),
          ]);
          entryCount++;

          if (jobsProcessed % logEveryNJobs === 0) {
            this.logger.log(
              `[Master ZIP] ${jobsProcessed}/${totalJobs} jobs processed ` +
                `(${Math.round((jobsProcessed / totalJobs) * 100)}%, ` +
                `${entryCount} entries written)`,
            );
          }
        }
      });

      // Guard against the impossible-but-defensible case where the
      // pre-flight count said >0 but every job ended up with zero rows
      // (e.g. all rows somehow filtered post-load). Keeps the API
      // contract: never produce an empty ZIP.
      if (entryCount === 0) {
        throw new NotFoundException(
          'No job items found for the provided job IDs to export',
        );
      }

      this.logger.log(
        `[Master ZIP] Build complete — ${entryCount} XLSX entries ` +
          `in ${Date.now() - buildStartedAt}ms ` +
          `(total ${Date.now() - startedAt}ms incl. pre-scan)`,
      );

      const fileName = `reports-export-${this.buildHumanReadableTimestamp()}.zip`;
      return { fileName };
    } catch (error) {
      this.logger.error(
        `Error streaming master ZIP: ${error.message}`,
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
   * recurring_report_bucket_id) and exports every matching job item into
   * a SINGLE combined CSV (not a zip-of-CSVs like POST /jobs/export-master).
   *
   * The headers are computed across all jobs together, so if the bucket
   * contains any Expedia jobs the Expedia-specific columns (Card Activity,
   * Calculated Amount to Charge, Amount Match, dynamic Approved Amount K)
   * appear in the file. Non-Expedia rows simply leave those cells blank.
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

      const jobs = await this.repository.findManyForMasterExport(jobIds);
      if (!jobs || jobs.length === 0) {
        throw new NotFoundException(
          `No jobs found for recurring_id=${recurringId}, recurring_report_bucket_id=${bucketId}`,
        );
      }

      const { headers, rows } = buildMasterRows(jobs);
      if (rows.length === 0) {
        throw new NotFoundException(
          'No job items found for the matching jobs to export',
        );
      }

      const buffer = this.buildMasterCsvBuffer(rows, headers);
      const fileName = `${this.buildMasterZipBaseName(jobs)}.csv`;

      return { buffer, fileName };
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
