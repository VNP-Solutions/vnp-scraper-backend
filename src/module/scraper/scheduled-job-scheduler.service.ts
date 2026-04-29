import { HttpService } from '@nestjs/axios';
import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { firstValueFrom } from 'rxjs';
import { IJobService } from '../job/job.interface';
import { IRecurringJobService } from '../recurring-job/recurring-job.interface';
import { IRetrievalService } from '../retrieval/retrieval.interface';
import { IServerService } from '../server/server.interface';
import { BookingBulkDispatchService } from './booking-bulk-dispatch.service';
import { IScheduledJobService } from './scheduled-job.interface';
import { IScraperJobItemService } from './scraper-job-item.interface';

@Injectable()
export class ScheduledJobSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledJobSchedulerService.name);

  constructor(
    @Inject('IScheduledJobService')
    private readonly scheduledJobService: IScheduledJobService,
    @Inject('IJobService')
    private readonly jobService: IJobService,
    @Inject('IRetrievalService')
    private readonly retrievalService: IRetrievalService,
    @Inject('IScraperJobItemService')
    private readonly jobItemService: IScraperJobItemService,
    @Inject('IRecurringJobService')
    private readonly recurringJobService: IRecurringJobService,
    @Inject('IServerService')
    private readonly serverService: IServerService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly bookingBulkDispatchService: BookingBulkDispatchService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit() {
    const cronExpression = this.configService.get<string>('SCHEDULED_JOB_CRON_TIME') || '0 0 0 * * *';
    this.logger.log(`Registering scheduled jobs cron with expression: ${cronExpression}`);
    
    const job = new CronJob(cronExpression, () => {
      this.handleScheduledJobs();
    });

    this.schedulerRegistry.addCronJob('handleScheduledJobs', job);
    job.start();
  }

  async handleScheduledJobs() {
    this.logger.log('Starting scheduled jobs execution...');

    try {
      // Get today's date in YYYY-MM-DD format (UTC)
      const today = new Date();
      const dateString = today.toISOString().split('T')[0];

      this.logger.log(`Checking for scheduled jobs on ${dateString}`);

      // Find scheduled job for today
      const scheduledJob =
        await this.scheduledJobService.getScheduledJobByDate(dateString);

      if (
        !scheduledJob ||
        ((!scheduledJob.job_ids || scheduledJob.job_ids.length === 0) &&
          (!scheduledJob.retrieval_ids ||
            scheduledJob.retrieval_ids.length === 0))
      ) {
        this.logger.log(`No scheduled jobs found for ${dateString}`);
        return;
      }

      const jobCount = scheduledJob.job_ids?.length || 0;
      const retrievalCount = scheduledJob.retrieval_ids?.length || 0;
      this.logger.log(
        `Found ${jobCount} scheduled job(s) and ${retrievalCount} scheduled retrieval(s) for ${dateString}`,
      );

      // Prepare jobs array for batch execution
      const jobs = (scheduledJob.job_ids || []).map((jobId) => ({
        jobId,
      }));

      // Prepare retrieval jobs array for batch execution
      const retrievalJobs = (scheduledJob.retrieval_ids || []).map(
        (retrievalId) => ({
          retrieval_id: retrievalId,
        }),
      );

      // Execute batch jobs
      if (jobs.length > 0) {
        await this.executeBatchJobs(jobs, dateString, scheduledJob.id);
      }

      // Execute batch retrieval jobs
      if (retrievalJobs.length > 0) {
        await this.executeBatchRetrievalJobs(retrievalJobs, dateString);
      }

      this.logger.log(`Scheduled jobs execution completed for ${dateString}`);
    } catch (error) {
      this.logger.error(
        `Error during scheduled jobs execution: ${error.message}`,
        error.stack,
      );
    }
  }

  // Manual trigger method for testing or manual execution
  async triggerScheduledJobsForDate(date: string) {
    this.logger.log(`Manually triggering scheduled jobs for date: ${date}`);

    try {
      const scheduledJob =
        await this.scheduledJobService.getScheduledJobByDate(date);

      if (
        !scheduledJob ||
        ((!scheduledJob.job_ids || scheduledJob.job_ids.length === 0) &&
          (!scheduledJob.retrieval_ids ||
            scheduledJob.retrieval_ids.length === 0))
      ) {
        this.logger.log(`No scheduled jobs found for ${date}`);
        return {
          success: false,
          message: `No scheduled jobs found for ${date}`,
        };
      }

      const jobs = (scheduledJob.job_ids || []).map((jobId) => ({
        jobId,
      }));

      const retrievalJobs = (scheduledJob.retrieval_ids || []).map(
        (retrievalId) => ({
          retrieval_id: retrievalId,
        }),
      );

      if (jobs.length > 0) {
        await this.executeBatchJobs(jobs, date, scheduledJob.id);
      }

      if (retrievalJobs.length > 0) {
        await this.executeBatchRetrievalJobs(retrievalJobs, date);
      }

      const jobCount = scheduledJob.job_ids?.length || 0;
      const retrievalCount = scheduledJob.retrieval_ids?.length || 0;
      return {
        success: true,
        message: `Scheduled jobs executed successfully for ${date}`,
        jobCount,
        retrievalCount,
      };
    } catch (error) {
      this.logger.error(
        `Error manually triggering scheduled jobs for ${date}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async executeBatchJobs(
    jobs: Array<{ jobId: string }>,
    date: string,
    scheduledJobRecordId?: string,
  ) {
    try {
      if (!jobs || jobs.length === 0) {
        this.logger.warn('No jobs provided for batch execution');
        return;
      }

      const processedResults = [];

      // First, group jobs by OTA provider and billing type
      const expediaDbJobs: Array<{ jobId: string }> = [];
      const expediaJobs: Array<{ jobId: string }> = [];
      const agodaJobs: Array<{ jobId: string }> = [];
      const bookingJobs: Array<{
        jobId: string;
        propertyId: string | null;
      }> = [];

      // Fetch OTA providers and billing types for all jobs
      for (const jobRequest of jobs) {
        try {
          const job = await this.jobService.getJobById(jobRequest.jobId);
          const otaProvider = job.ota_provider || 'Expedia';
          const billingType = job.billing_type;

          if (billingType === 'DB' && otaProvider === 'Expedia') {
            expediaDbJobs.push(jobRequest);
          } else if (otaProvider === 'Expedia') {
            expediaJobs.push(jobRequest);
          } else if (otaProvider === 'Agoda') {
            agodaJobs.push(jobRequest);
          } else if (otaProvider === 'Booking') {
            bookingJobs.push({
              jobId: jobRequest.jobId,
              propertyId: job.property_id,
            });
          } else {
            processedResults.push({
              jobId: jobRequest.jobId,
              otaProvider: 'Unknown',
              status: HttpStatus.BAD_REQUEST,
              message: `Unknown OTA provider: ${otaProvider}`,
              success: false,
              error: 'Invalid OTA provider',
            });
          }
        } catch (error: any) {
          this.logger.error(
            `Error fetching job ${jobRequest.jobId}: ${error.message}`,
          );
          processedResults.push({
            jobId: jobRequest.jobId,
            otaProvider: 'Unknown',
            status: HttpStatus.BAD_REQUEST,
            message: `Job with ID ${jobRequest.jobId} not found`,
            success: false,
            error: 'Invalid job_id',
          });
        }
      }

      // Process Expedia DB jobs using bulk API (grouped by server URL)
      if (expediaDbJobs.length > 0) {
        try {
          // Group Expedia DB jobs by their server URL
          const urlToJobsMap = await this.groupDbJobsByServerUrl(expediaDbJobs);

          // Process each server group separately
          for (const [dbUrl, jobIds] of urlToJobsMap.entries()) {
            try {
              if (!dbUrl) {
                // Mark jobs with no URL as failed
                for (const jobId of jobIds) {
                  processedResults.push({
                    jobId,
                    otaProvider: 'Expedia',
                    billingType: 'DB',
                    status: HttpStatus.SERVICE_UNAVAILABLE,
                    message:
                      'No Expedia DB server URL configured (EXPEDIA_DB_SERVER_URL)',
                    success: false,
                    error: 'Expedia DB server URL not configured',
                  });
                }
                continue;
              }

              this.logger.log(
                `[Scheduled Batch] Processing ${jobIds.length} Expedia DB jobs on server ${dbUrl} using bulk API`,
              );

              // Call bulk DB run job API
              const bulkRequestBody = {
                job_ids: jobIds,
              };

              const response = await firstValueFrom(
                this.httpService.post(
                  `${dbUrl}/api/expedia/bulk-db-run-job`,
                  bulkRequestBody,
                  {
                    headers: {
                      'Content-Type': 'application/json',
                      Accept: 'application/json',
                    },
                    timeout: 300000, // 5 minute timeout
                  },
                ),
              );

              // Log which jobs started running on which API
              this.logger.log(
                `Jobs [${jobIds.join(', ')}] started running on API: ${dbUrl}/api/expedia/bulk-db-run-job`,
              );

              // Process bulk response
              if (
                response.data?.results &&
                Array.isArray(response.data.results)
              ) {
                for (const result of response.data.results) {
                  processedResults.push({
                    jobId: result.jobId || result.job_id,
                    otaProvider: 'Expedia',
                    billingType: 'DB',
                    status: result.status || response.status,
                    message: result.message || 'DB job run successfully',
                    success: result.success !== false,
                    data: result.data,
                    error: result.error,
                  });
                }
              } else {
                // If bulk API doesn't return individual results, mark all as successful
                for (const jobId of jobIds) {
                  processedResults.push({
                    jobId,
                    otaProvider: 'Expedia',
                    billingType: 'DB',
                    status: response.status,
                    message:
                      response.data?.message || 'Bulk DB job run successfully',
                    success: true,
                    data: response.data,
                  });
                }
              }
            } catch (serverGroupError: any) {
              const status =
                serverGroupError.response?.status ||
                HttpStatus.INTERNAL_SERVER_ERROR;
              const errorMessage =
                serverGroupError.response?.data?.message ||
                serverGroupError.message ||
                'Unknown error occurred';

              // Mark jobs in this server group as failed
              for (const jobId of jobIds) {
                processedResults.push({
                  jobId,
                  otaProvider: 'Expedia',
                  billingType: 'DB',
                  status,
                  message: errorMessage,
                  success: false,
                  error: errorMessage,
                });
              }
            }
          }
        } catch (error: any) {
          this.logger.error(
            `Error grouping Expedia DB jobs by server: ${error.message}`,
          );
          // Mark all DB jobs as failed
          for (const jobRequest of expediaDbJobs) {
            processedResults.push({
              jobId: jobRequest.jobId,
              otaProvider: 'Expedia',
              billingType: 'DB',
              status: HttpStatus.INTERNAL_SERVER_ERROR,
              message: error.message || 'Failed to group jobs by server',
              success: false,
              error: error.message,
            });
          }
        }
      }

      // Process Expedia jobs using bulk API (grouped by server URL)
      if (expediaJobs.length > 0) {
        try {
          // Group Expedia jobs by their server URL
          const urlToJobsMap = await this.groupJobsByServerUrl(
            expediaJobs,
            'Expedia',
          );

          // Process each server group separately
          for (const [expediaUrl, jobIds] of urlToJobsMap.entries()) {
            try {
              if (!expediaUrl) {
                // Mark jobs with no URL as failed
                for (const jobId of jobIds) {
                  processedResults.push({
                    jobId,
                    otaProvider: 'Expedia',
                    status: HttpStatus.SERVICE_UNAVAILABLE,
                    message: `No Expedia server URL configured (EXPEDIA_SERVER_URL)`,
                    success: false,
                    error: 'Expedia server URL not configured',
                  });
                }
                continue;
              }

              // Determine the API path based on EXPEDIA_MODE
              const expediadMode =
                this.configService.get<string>('EXPEDIA_MODE');
              const apiPath =
                expediadMode === 'graphql'
                  ? '/api/expedia/bulk-graphql-run-job'
                  : '/api/expedia/bulk-property-run-job';

              this.logger.log(
                `[Scheduled Batch] Processing ${jobIds.length} Expedia jobs on server ${expediaUrl}${apiPath} using bulk API with ${expediadMode || 'scraper'} mode: ${apiPath}`,
              );

              // Call bulk property run job API
              const bulkRequestBody = {
                job_ids: jobIds,
              };

              const response = await firstValueFrom(
                this.httpService.post(
                  `${expediaUrl}${apiPath}`,
                  bulkRequestBody,
                  {
                    headers: {
                      'Content-Type': 'application/json',
                      Accept: 'application/json',
                    },
                    timeout: 300000, // 5 minute timeout
                  },
                ),
              );

              // Log which jobs started running on which API
              this.logger.log(
                `Jobs [${jobIds.join(', ')}] started running on API: ${expediaUrl}${apiPath}`,
              );

              // Process bulk response
              if (
                response.data?.results &&
                Array.isArray(response.data.results)
              ) {
                for (const result of response.data.results) {
                  processedResults.push({
                    jobId: result.jobId || result.job_id,
                    otaProvider: 'Expedia',
                    status: result.status || response.status,
                    message: result.message || 'Job run successfully',
                    success: result.success !== false,
                    data: result.data,
                    error: result.error,
                  });
                }
              } else {
                // If bulk API doesn't return individual results, mark all as successful
                for (const jobId of jobIds) {
                  processedResults.push({
                    jobId,
                    otaProvider: 'Expedia',
                    status: response.status,
                    message:
                      response.data?.message || 'Bulk job run successfully',
                    success: true,
                    data: response.data,
                  });
                }
              }
            } catch (serverGroupError: any) {
              const status =
                serverGroupError.response?.status ||
                HttpStatus.INTERNAL_SERVER_ERROR;
              const errorMessage =
                serverGroupError.response?.data?.message ||
                serverGroupError.message ||
                'Unknown error occurred';

              // Mark jobs in this server group as failed
              for (const jobId of jobIds) {
                processedResults.push({
                  jobId,
                  otaProvider: 'Expedia',
                  status,
                  message: errorMessage,
                  success: false,
                  error: errorMessage,
                });
              }
            }
          }
        } catch (error: any) {
          this.logger.error(
            `Error grouping Expedia jobs by server: ${error.message}`,
          );
          // Mark all Expedia jobs as failed
          for (const jobRequest of expediaJobs) {
            processedResults.push({
              jobId: jobRequest.jobId,
              otaProvider: 'Expedia',
              status: HttpStatus.INTERNAL_SERVER_ERROR,
              message: error.message || 'Failed to group jobs by server',
              success: false,
              error: error.message,
            });
          }
        }
      }

      // Process Agoda jobs using bulk API (grouped by server URL)
      if (agodaJobs.length > 0) {
        try {
          // Group Agoda jobs by their server URL
          const urlToJobsMap = await this.groupJobsByServerUrl(
            agodaJobs,
            'Agoda',
          );

          // Process each server group separately
          for (const [agodaUrl, jobIds] of urlToJobsMap.entries()) {
            try {
              if (!agodaUrl) {
                // Mark jobs with no URL as failed
                for (const jobId of jobIds) {
                  processedResults.push({
                    jobId,
                    otaProvider: 'Agoda',
                    status: HttpStatus.SERVICE_UNAVAILABLE,
                    message: `No Agoda server URL configured (AGODA_SERVER_URL)`,
                    success: false,
                    error: 'Agoda server URL not configured',
                  });
                }
                continue;
              }

              this.logger.log(
                `[Scheduled Batch] Processing ${jobIds.length} Agoda jobs on server ${agodaUrl} using bulk API`,
              );

              // Call bulk property run job API
              const bulkRequestBody = {
                job_ids: jobIds,
              };

              const response = await firstValueFrom(
                this.httpService.post(
                  `${agodaUrl}/api/agoda/bulk-property-run-job`,
                  bulkRequestBody,
                  {
                    headers: {
                      'Content-Type': 'application/json',
                      Accept: 'application/json',
                    },
                    timeout: 300000, // 5 minute timeout
                  },
                ),
              );

              // Log which jobs started running on which API
              this.logger.log(
                `Jobs [${jobIds.join(', ')}] started running on API: ${agodaUrl}/api/agoda/bulk-property-run-job`,
              );

              // Process bulk response
              if (
                response.data?.results &&
                Array.isArray(response.data.results)
              ) {
                for (const result of response.data.results) {
                  processedResults.push({
                    jobId: result.jobId || result.job_id,
                    otaProvider: 'Agoda',
                    status: result.status || response.status,
                    message: result.message || 'Job run successfully',
                    success: result.success !== false,
                    data: result.data,
                    error: result.error,
                  });
                }
              } else {
                // If bulk API doesn't return individual results, mark all as successful
                for (const jobId of jobIds) {
                  processedResults.push({
                    jobId,
                    otaProvider: 'Agoda',
                    status: response.status,
                    message:
                      response.data?.message || 'Bulk job run successfully',
                    success: true,
                    data: response.data,
                  });
                }
              }
            } catch (serverGroupError: any) {
              const status =
                serverGroupError.response?.status ||
                HttpStatus.INTERNAL_SERVER_ERROR;
              const errorMessage =
                serverGroupError.response?.data?.message ||
                serverGroupError.message ||
                'Unknown error occurred';

              // Mark jobs in this server group as failed
              for (const jobId of jobIds) {
                processedResults.push({
                  jobId,
                  otaProvider: 'Agoda',
                  status,
                  message: errorMessage,
                  success: false,
                  error: errorMessage,
                });
              }
            }
          }
        } catch (error: any) {
          this.logger.error(
            `Error grouping Agoda jobs by server: ${error.message}`,
          );
          // Mark all Agoda jobs as failed
          for (const jobRequest of agodaJobs) {
            processedResults.push({
              jobId: jobRequest.jobId,
              otaProvider: 'Agoda',
              status: HttpStatus.INTERNAL_SERVER_ERROR,
              message: error.message || 'Failed to group jobs by server',
              success: false,
              error: error.message,
            });
          }
        }
      }

      // Process Booking jobs (credential-grouped bulk + scheduled_job_id, grouped by server URL)
      if (bookingJobs.length > 0) {
        try {
          // Group Booking jobs by their server URL
          const urlToJobsMap = new Map<
            string,
            Array<{ jobId: string; propertyId: string | null }>
          >();

          for (const bookingJob of bookingJobs) {
            const url = await this.getUrlForJob(bookingJob.jobId, 'Booking');

            if (url) {
              const existing = urlToJobsMap.get(url) || [];
              existing.push(bookingJob);
              urlToJobsMap.set(url, existing);
            }
          }

          // Process each server group separately
          for (const [bookingUrl, jobsForServer] of urlToJobsMap.entries()) {
            try {
              if (!bookingUrl) {
                // Mark jobs with no URL as failed
                for (const jobRequest of jobsForServer) {
                  processedResults.push({
                    jobId: jobRequest.jobId,
                    otaProvider: 'Booking',
                    status: HttpStatus.SERVICE_UNAVAILABLE,
                    message: `No Booking server URL configured (BOOKING_SERVER_URL)`,
                    success: false,
                    error: 'Booking server URL not configured',
                  });
                }
                continue;
              }

              this.logger.log(
                `[Scheduled Batch] Processing ${jobsForServer.length} Booking job(s) on server ${bookingUrl} via grouped bulk API (scheduled_job_id: ${scheduledJobRecordId ?? 'none'})`,
              );

              const bookingRows =
                await this.bookingBulkDispatchService.dispatchGroupedBulkRuns(
                  jobsForServer.map((j) => ({
                    jobId: j.jobId,
                    propertyId: j.propertyId,
                  })),
                  bookingUrl,
                  (jobId, url) =>
                    this.jobItemService.updateJobCurrentUrl(jobId, url),
                  { scheduledJobId: scheduledJobRecordId },
                );

              // Log which jobs started running on which server
              const bookingJobIds = jobsForServer.map((j) => j.jobId);
              this.logger.log(
                `Jobs [${bookingJobIds.join(', ')}] started running on Booking server: ${bookingUrl}`,
              );

              for (const row of bookingRows) {
                processedResults.push(row);
              }
            } catch (serverGroupError: any) {
              this.logger.error(
                `Error processing Booking jobs on server ${bookingUrl}: ${serverGroupError.message}`,
              );

              // Mark jobs in this server group as failed
              for (const jobRequest of jobsForServer) {
                processedResults.push({
                  jobId: jobRequest.jobId,
                  otaProvider: 'Booking',
                  status: HttpStatus.INTERNAL_SERVER_ERROR,
                  message:
                    serverGroupError.message ||
                    'Failed to process Booking jobs',
                  success: false,
                  error: serverGroupError.message,
                });
              }
            }
          }
        } catch (error: any) {
          this.logger.error(
            `Error grouping Booking jobs by server: ${error.message}`,
          );
          // Mark all Booking jobs as failed
          for (const jobRequest of bookingJobs) {
            processedResults.push({
              jobId: jobRequest.jobId,
              otaProvider: 'Booking',
              status: HttpStatus.INTERNAL_SERVER_ERROR,
              message: error.message || 'Failed to group jobs by server',
              success: false,
              error: error.message,
            });
          }
        }
      }

      const successfulJobs = processedResults.filter(
        (result) => result.success,
      ).length;
      const failedJobs = processedResults.length - successfulJobs;

      this.logger.log(
        `Scheduled jobs execution completed for ${date}. Summary: ${successfulJobs} succeeded, ${failedJobs} failed`,
      );

      // Handle recurring jobs - create next month's jobs
      await this.handleRecurringJobs(jobs, date);
    } catch (error) {
      this.logger.error(
        `Error executing batch jobs for scheduled date ${date}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Handle recurring jobs after execution - create next month's jobs
   */
  private async handleRecurringJobs(
    jobs: Array<{ jobId: string }>,
    currentDate: string,
  ) {
    try {
      this.logger.log(
        `Checking for recurring jobs to create next month's schedule...`,
      );

      let recurringJobsCount = 0;
      let nextMonthJobsCreated = 0;

      for (const jobRequest of jobs) {
        try {
          const job = await this.jobService.getJobById(jobRequest.jobId);

          // Check if job has a recurring_id and schedule_date
          if (job.recurring_id && job.schedule_date) {
            recurringJobsCount++;

            // Create next month's job for this recurring job, using the same server
            const nextJob = await this.recurringJobService.createNextMonthJob(
              job.recurring_id,
              job.schedule_date,
              job.server_id, // Pass the current job's server_id
            );

            if (nextJob) {
              nextMonthJobsCreated++;
              this.logger.log(
                `Created next month job ${nextJob.id} for recurring job ${job.recurring_id}`,
              );
            }
          }
        } catch (error: any) {
          this.logger.error(
            `Error handling recurring job for ${jobRequest.jobId}: ${error.message}`,
          );
          // Continue with other jobs even if one fails
        }
      }

      if (recurringJobsCount > 0) {
        this.logger.log(
          `Recurring jobs processing completed: ${nextMonthJobsCreated} next month jobs created out of ${recurringJobsCount} recurring jobs`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error in handleRecurringJobs: ${error.message}`,
        error.stack,
      );
      // Don't throw - we don't want to fail the entire scheduled job execution
    }
  }

  private normalizeUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    // Check if we're in production to prefer HTTPS
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const defaultProtocol = isProduction ? 'https' : 'http';

    return `${defaultProtocol}://${url}`;
  }

  private getUrlByOtaProvider(otaProvider: string): string | null {
    let envKey: string;

    switch (otaProvider) {
      case 'Expedia':
        envKey = 'EXPEDIA_SERVER_URL';
        break;
      case 'Agoda':
        envKey = 'AGODA_SERVER_URL';
        break;
      case 'Booking':
        envKey = 'BOOKING_SERVER_URL';
        break;
      default:
        this.logger.warn(`Unknown OTA provider: ${otaProvider}`);
        return null;
    }

    const url = this.configService.get<string>(envKey);
    if (!url) {
      this.logger.warn(`No URL configured for ${otaProvider} (${envKey})`);
      return null;
    }

    const normalizedUrl = this.normalizeUrl(url);
    this.logger.log(`${otaProvider} URL: ${normalizedUrl}`);
    return normalizedUrl;
  }

  /**
   * Get URL for a DB job, checking server first, then falling back to EXPEDIA_DB_SERVER_URL
   */
  private async getUrlForDbJob(jobId: string): Promise<string | null> {
    try {
      // Fetch the job to check if it has a server assigned
      const job = await this.jobService.getJobById(jobId);

      if (job.server_id) {
        try {
          // Fetch the server details
          const server = await this.serverService.findServerById(job.server_id);

          if (!server.is_active) {
            this.logger.warn(
              `Server ${server.name} (ID: ${server.id}) is inactive for DB job ${jobId}, falling back to EXPEDIA_DB_SERVER_URL`,
            );
            return this.getExpediaDbUrl();
          }

          const normalizedUrl = this.normalizeUrl(server.url);
          this.logger.log(
            `DB Job ${jobId} will use server "${server.name}" (${normalizedUrl})`,
          );
          return normalizedUrl;
        } catch (serverError: any) {
          this.logger.error(
            `Failed to fetch server ${job.server_id} for DB job ${jobId}: ${serverError.message}, falling back to EXPEDIA_DB_SERVER_URL`,
          );
          return this.getExpediaDbUrl();
        }
      } else {
        // No server assigned, use EXPEDIA_DB_SERVER_URL
        this.logger.log(
          `DB Job ${jobId} has no server assigned, using EXPEDIA_DB_SERVER_URL`,
        );
        return this.getExpediaDbUrl();
      }
    } catch (error: any) {
      this.logger.error(
        `Error getting URL for DB job ${jobId}: ${error.message}, falling back to EXPEDIA_DB_SERVER_URL`,
      );
      return this.getExpediaDbUrl();
    }
  }

  /**
   * Get URL for a specific job, checking server first, then falling back to OTA provider ENV
   */
  private async getUrlForJob(
    jobId: string,
    otaProvider: string,
  ): Promise<string | null> {
    try {
      // Fetch the job to check if it has a server assigned
      const job = await this.jobService.getJobById(jobId);

      if (job.server_id) {
        try {
          // Fetch the server details
          const server = await this.serverService.findServerById(job.server_id);

          if (!server.is_active) {
            this.logger.warn(
              `Server ${server.name} (ID: ${server.id}) is inactive for job ${jobId}, falling back to ENV URL`,
            );
            return this.getUrlByOtaProvider(otaProvider);
          }

          const normalizedUrl = this.normalizeUrl(server.url);
          this.logger.log(
            `Job ${jobId} will use server "${server.name}" (${normalizedUrl})`,
          );
          return normalizedUrl;
        } catch (serverError: any) {
          this.logger.error(
            `Failed to fetch server ${job.server_id} for job ${jobId}: ${serverError.message}, falling back to ENV URL`,
          );
          return this.getUrlByOtaProvider(otaProvider);
        }
      } else {
        // No server assigned, use ENV URL
        this.logger.log(`Job ${jobId} has no server assigned, using ENV URL`);
        return this.getUrlByOtaProvider(otaProvider);
      }
    } catch (error: any) {
      this.logger.error(
        `Error getting URL for job ${jobId}: ${error.message}, falling back to ENV URL`,
      );
      return this.getUrlByOtaProvider(otaProvider);
    }
  }

  /**
   * Group jobs by their target server URL
   * Returns a map of URL -> array of job IDs
   */
  private async groupJobsByServerUrl(
    jobs: Array<{ jobId: string }>,
    otaProvider: string,
  ): Promise<Map<string, string[]>> {
    const urlToJobsMap = new Map<string, string[]>();

    for (const jobRequest of jobs) {
      const url = await this.getUrlForJob(jobRequest.jobId, otaProvider);

      if (url) {
        const existing = urlToJobsMap.get(url) || [];
        existing.push(jobRequest.jobId);
        urlToJobsMap.set(url, existing);
      }
    }

    return urlToJobsMap;
  }

  /**
   * Group DB jobs by their target server URL (uses EXPEDIA_DB_SERVER_URL as fallback)
   * Returns a map of URL -> array of job IDs
   */
  private async groupDbJobsByServerUrl(
    jobs: Array<{ jobId: string }>,
  ): Promise<Map<string, string[]>> {
    const urlToJobsMap = new Map<string, string[]>();

    for (const jobRequest of jobs) {
      const url = await this.getUrlForDbJob(jobRequest.jobId);

      if (url) {
        const existing = urlToJobsMap.get(url) || [];
        existing.push(jobRequest.jobId);
        urlToJobsMap.set(url, existing);
      }
    }

    return urlToJobsMap;
  }

  private getExpediaDbUrl(): string | null {
    const url = this.configService.get<string>('EXPEDIA_DB_SERVER_URL');
    if (!url) {
      this.logger.warn('No EXPEDIA_DB_SERVER_URL configured');
      return null;
    }

    const normalizedUrl = this.normalizeUrl(url);
    this.logger.log(`Expedia DB URL: ${normalizedUrl}`);
    return normalizedUrl;
  }

  private getBaseApiPath(otaProvider: string): string {
    switch (otaProvider) {
      case 'Expedia':
        return '/api/expedia';
      case 'Agoda':
        return '/api/agoda';
      case 'Booking':
        return '/api/booking';
      default:
        return '/api/expedia'; // Default to Expedia
    }
  }

  private getApiPathByOtaProvider(
    otaProvider: string,
    jobType: string = 'property-run-job',
  ): string {
    const baseApiPath = this.getBaseApiPath(otaProvider);

    // Special handling for Expedia based on EXPEDIA_MODE (only Expedia supports GraphQL mode)
    if (otaProvider === 'Expedia' && jobType === 'property-run-job') {
      const expediadMode = this.configService.get<string>('EXPEDIA_MODE');
      if (expediadMode === 'graphql') {
        return `${baseApiPath}/graphql-run-job`;
      }
      // Default to scraper mode for Expedia
      return `${baseApiPath}/property-run-job`;
    }

    // For all other providers (Booking, Agoda) and job types, use standard path
    return `${baseApiPath}/${jobType}`;
  }

  private getExpediaRetrievalUrl(): string | null {
    const url = this.configService.get<string>('EXPEDIA_RETRIVAL_SERVER_URL');
    if (!url) {
      this.logger.warn('No EXPEDIA_RETRIVAL_SERVER_URL configured');
      return null;
    }

    const normalizedUrl = this.normalizeUrl(url);
    this.logger.log(`Expedia Retrieval URL: ${normalizedUrl}`);
    return normalizedUrl;
  }

  private getAgodaRetrievalUrl(): string | null {
    const url = this.configService.get<string>('AGODA_RETRIVAL_SERVER_URL');
    if (!url) {
      this.logger.warn('No AGODA_RETRIVAL_SERVER_URL configured');
      return null;
    }

    const normalizedUrl = this.normalizeUrl(url);
    this.logger.log(`Agoda Retrieval URL: ${normalizedUrl}`);
    return normalizedUrl;
  }

  private getRetrievalUrlByOtaProvider(otaProvider: string): string | null {
    switch (otaProvider) {
      case 'Expedia':
        return this.getExpediaRetrievalUrl();
      case 'Agoda':
        return this.getAgodaRetrievalUrl();
      default:
        this.logger.warn(
          `Unknown OTA provider: ${otaProvider}, defaulting to Expedia`,
        );
        return this.getExpediaRetrievalUrl();
    }
  }

  private async executeBatchRetrievalJobs(
    retrievalJobs: Array<{ retrieval_id: string }>,
    date: string,
  ) {
    try {
      if (!retrievalJobs || retrievalJobs.length === 0) {
        this.logger.warn('No retrieval jobs provided for batch execution');
        return;
      }

      const processedResults = [];

      // First, group jobs by OTA provider
      const expediaJobs: Array<{ retrieval_id: string }> = [];
      const agodaJobs: Array<{ retrieval_id: string }> = [];

      // Fetch OTA providers for all jobs
      for (const retrievalRequest of retrievalJobs) {
        try {
          const retrieval = await this.retrievalService.getRetrievalById(
            retrievalRequest.retrieval_id,
          );
          const otaProvider = retrieval.ota_provider || 'Expedia';

          if (otaProvider === 'Expedia') {
            expediaJobs.push(retrievalRequest);
          } else if (otaProvider === 'Agoda') {
            agodaJobs.push(retrievalRequest);
          }
        } catch (error: any) {
          this.logger.error(
            `Error fetching retrieval ${retrievalRequest.retrieval_id}: ${error.message}`,
          );
          processedResults.push({
            jobId: retrievalRequest.retrieval_id,
            otaProvider: 'Unknown',
            status: HttpStatus.BAD_REQUEST,
            message: `Retrieval with ID ${retrievalRequest.retrieval_id} not found`,
            success: false,
            error: 'Invalid retrieval_id',
          });
        }
      }

      // Process Expedia jobs using bulk API
      if (expediaJobs.length > 0) {
        try {
          // Get Expedia retrieval URL
          const expediaUrl = this.getRetrievalUrlByOtaProvider('Expedia');

          if (!expediaUrl) {
            // Mark all Expedia jobs as failed
            for (const retrievalRequest of expediaJobs) {
              processedResults.push({
                jobId: retrievalRequest.retrieval_id,
                otaProvider: 'Expedia',
                status: HttpStatus.SERVICE_UNAVAILABLE,
                message: `No Expedia retrieval server URL configured (EXPEDIA_RETRIVAL_SERVER_URL)`,
                success: false,
                error: 'Expedia retrieval server URL not configured',
              });
            }
          } else {
            // Collect all Expedia retrieval IDs
            const retrievalIds = expediaJobs.map((job) => job.retrieval_id);

            // Determine the API path based on EXPEDIA_MODE
            const expediadMode = this.configService.get<string>('EXPEDIA_MODE');
            const apiPath =
              expediadMode === 'graphql'
                ? '/api/expedia/bulk-graphql-retrieval-run-job'
                : '/api/expedia/bulk-retrieval-run-job';

            this.logger.log(
              `[Scheduled Batch Retrieval] Processing ${expediaJobs.length} Expedia retrievals using bulk API with ${expediadMode || 'scraper'} mode: ${apiPath}`,
            );

            // Call bulk-retrieval-run-job API
            const bulkRequestBody = {
              retrieval_ids: retrievalIds,
            };

            const response = await firstValueFrom(
              this.httpService.post(
                `${expediaUrl}${apiPath}`,
                bulkRequestBody,
                {
                  headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                  },
                  timeout: 300000, // 5 minute timeout
                },
              ),
            );

            // Process bulk response
            if (
              response.data?.results &&
              Array.isArray(response.data.results)
            ) {
              // If the bulk API returns individual results, use them
              for (const result of response.data.results) {
                processedResults.push({
                  jobId: result.retrieval_id || result.jobId,
                  otaProvider: 'Expedia',
                  status: result.status || response.status,
                  message: result.message || 'Retrieval run successfully',
                  success: result.success !== false,
                  data: result.data,
                  error: result.error,
                });
              }
            } else {
              // If bulk API doesn't return individual results, mark all as successful
              for (const retrievalRequest of expediaJobs) {
                processedResults.push({
                  jobId: retrievalRequest.retrieval_id,
                  otaProvider: 'Expedia',
                  status: response.status,
                  message:
                    response.data?.message || 'Bulk retrieval run successfully',
                  success: true,
                  data: response.data,
                });
              }
            }
          }
        } catch (error: any) {
          const status =
            error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
          const errorMessage =
            error.response?.data?.message ||
            error.message ||
            'Unknown error occurred';

          // Mark all Expedia jobs as failed
          for (const retrievalRequest of expediaJobs) {
            processedResults.push({
              jobId: retrievalRequest.retrieval_id,
              otaProvider: 'Expedia',
              status,
              message: errorMessage,
              success: false,
              error: errorMessage,
            });
          }
        }
      }

      // Process Agoda jobs using bulk API
      if (agodaJobs.length > 0) {
        try {
          // Get Agoda retrieval URL
          const agodaUrl = this.getRetrievalUrlByOtaProvider('Agoda');

          if (!agodaUrl) {
            // Mark all Agoda jobs as failed
            for (const retrievalRequest of agodaJobs) {
              processedResults.push({
                jobId: retrievalRequest.retrieval_id,
                otaProvider: 'Agoda',
                status: HttpStatus.SERVICE_UNAVAILABLE,
                message: `No Agoda retrieval server URL configured (AGODA_RETRIVAL_SERVER_URL)`,
                success: false,
                error: 'Agoda retrieval server URL not configured',
              });
            }
          } else {
            // Collect all Agoda retrieval IDs
            const retrievalIds = agodaJobs.map((job) => job.retrieval_id);

            this.logger.log(
              `[Scheduled Batch Retrieval] Processing ${agodaJobs.length} Agoda retrievals using bulk API`,
            );

            // Call bulk-retrieval-run-job API
            const bulkRequestBody = {
              retrieval_ids: retrievalIds,
            };

            const response = await firstValueFrom(
              this.httpService.post(
                `${agodaUrl}/api/agoda/bulk-retrieval-run-job`,
                bulkRequestBody,
                {
                  headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                  },
                  timeout: 300000, // 5 minute timeout
                },
              ),
            );

            // Process bulk response
            if (
              response.data?.results &&
              Array.isArray(response.data.results)
            ) {
              // If the bulk API returns individual results, use them
              for (const result of response.data.results) {
                processedResults.push({
                  jobId: result.retrieval_id || result.jobId,
                  otaProvider: 'Agoda',
                  status: result.status || response.status,
                  message: result.message || 'Retrieval run successfully',
                  success: result.success !== false,
                  data: result.data,
                  error: result.error,
                });
              }
            } else {
              // If bulk API doesn't return individual results, mark all as successful
              for (const retrievalRequest of agodaJobs) {
                processedResults.push({
                  jobId: retrievalRequest.retrieval_id,
                  otaProvider: 'Agoda',
                  status: response.status,
                  message:
                    response.data?.message || 'Bulk retrieval run successfully',
                  success: true,
                  data: response.data,
                });
              }
            }
          }
        } catch (error: any) {
          const status =
            error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
          const errorMessage =
            error.response?.data?.message ||
            error.message ||
            'Unknown error occurred';

          // Mark all Agoda jobs as failed
          for (const retrievalRequest of agodaJobs) {
            processedResults.push({
              jobId: retrievalRequest.retrieval_id,
              otaProvider: 'Agoda',
              status,
              message: errorMessage,
              success: false,
              error: errorMessage,
            });
          }
        }
      }

      const successfulJobs = processedResults.filter(
        (result) => result.success,
      ).length;
      const failedJobs = processedResults.length - successfulJobs;

      this.logger.log(
        `Scheduled retrieval jobs execution completed for ${date}. Summary: ${successfulJobs} succeeded, ${failedJobs} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Error executing batch retrieval jobs for scheduled date ${date}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
