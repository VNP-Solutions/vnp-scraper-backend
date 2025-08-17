import { Inject, Injectable, Logger } from '@nestjs/common';
import { Job, OTAProvider, PostingType } from '@prisma/client';
import * as XLSX from 'xlsx';
import { IPropertyRepository } from '../property/property.interface';
import { CreateJobDto, UpdateJobDto } from './job.dto';
import { IJobRepository, IJobService } from './job.interface';

@Injectable()
export class JobService implements IJobService {
  constructor(
    @Inject('IJobRepository')
    private readonly repository: IJobRepository,
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

  async getAllJobs(
    query: Record<string, any>,
  ): Promise<{ data: Job[]; metadata: any }> {
    try {
      const result = await this.repository.findAll(query);
      return result;
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

  async importJobsFromExcel(
    file: Express.Multer.File,
    userId: string,
  ): Promise<{
    jobsCreated: number;
    jobs: any[];
  }> {
    try {
      // Validate file buffer
      if (!file.buffer) {
        throw new Error('File buffer is empty');
      }

      // Parse Excel file - read all data as strings
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Read all data as strings
      const data = XLSX.utils.sheet_to_json(worksheet, {
        raw: false, // Convert all values to strings
        defval: '', // Default value for empty cells
      });

      if (!data || data.length === 0) {
        throw new Error('Excel file is empty or invalid');
      }

      console.log('data', data);

      // Debug: Log the first row to see data types
      if (data.length > 0) {
        const firstRow = data[0] as any;
        console.log(
          'First row data types:',
          Object.keys(firstRow).map((key) => ({
            key,
            value: firstRow[key],
            type: typeof firstRow[key],
          })),
        );
      }

      // Get headers from first row
      const headers = Object.keys(data[0] as any);

      this.logger.log(
        `Starting job import process for ${data.length} rows with headers: ${headers.join(', ')}`,
      );

      let jobsCreated = 0;
      const jobs: any[] = [];

      // Process each row
      for (const row of data) {
        const rowData = row as any;

        try {
          // Find related portfolio and sub-portfolio
          let portfolioId = null;
          let subPortfolioId = null;
          let portfolioName = '';
          let subPortfolioName = '';

          // Handle Portfolio - must exist if specified
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

          // Handle Sub Portfolio - must exist if specified
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

          // Handle Property - must exist if specified
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

          // Create job data
          const jobData: CreateJobDto = {
            name: rowData['Job Name'] || `Job ${jobsCreated + 1}`,
            job_status: rowData['Job Status'] || 'Pending',
            portfolio_id: portfolioId,
            sub_portfolio_id: subPortfolioId,
            property_id: propertyId,
            user_id: userId,
            posting_type: this.convertToPostingType(rowData['Posting Type']),
            portfolio_name: portfolioName,
            sub_portfolio_name: subPortfolioName,
            property_name: propertyName,
            billing_type: rowData['Billing Type'] || 'DB',
            next_due_date: rowData['Next Due Date']
              ? new Date(rowData['Next Due Date'])
              : undefined,
            ota_provider: this.convertToOTAProvider(rowData['OTA Provider']),
            remaining_direct_billed: parseFloat(
              rowData['Remaining Direct Billed'] || '0',
            ),
            total_collectable: parseFloat(rowData['Total Collectable'] || '0'),
            total_amount_confirmed: parseFloat(
              rowData['Total Amount Confirmed'] || '0',
            ),
            execution_type: rowData['Execution Type'] || 'Immediate',
            retries_attempted: parseInt(rowData['Retries Attempted'] || '0'),
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
            start_date:
              rowData['From (MM/DD/YYYY)'] || rowData['Start Date'] || null,
            end_date: rowData['To (MM/DD/YYYY)'] || rowData['End Date'] || null,
            log_link: rowData['Log Link'] || null,
            live_url: rowData['Live URL'] || null,
          };

          // Create job using existing method
          const newJob = await this.createJob(jobData);
          jobs.push(newJob);
          jobsCreated++;
          this.logger.log(`Created new job: ${newJob.name}`);
        } catch (error) {
          this.logger.error(`Error processing job row: ${error.message}`);
          // Re-throw the error to stop the import process
          throw error;
        }
      }

      this.logger.log(`Job import completed: ${jobsCreated} jobs created`);

      return {
        jobsCreated,
        jobs,
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
}
