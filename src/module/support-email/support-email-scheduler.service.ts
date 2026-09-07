import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IJobRepository } from '../job/job.interface';
import { ISupportEmailService } from './support-email.interface';

@Injectable()
export class SupportEmailSchedulerService {
  private readonly logger = new Logger(SupportEmailSchedulerService.name);

  constructor(
    @Inject('ISupportEmailService')
    private readonly supportEmailService: ISupportEmailService,
    @Inject('IJobRepository')
    private readonly jobRepository: IJobRepository,
  ) {}

  /**
   * Runs every 4 hours to automatically check support emails for Agoda jobs
   * that are Completed and have reply_status of NoReplied or RepliedRed
   */
  @Cron('0 */4 * * *') // Every 4 hours at the top of the hour
  async handleAutomaticSupportEmailCheck() {
    this.logger.log(
      'Starting automatic support email check (runs every 4 hours)...',
    );

    try {
      // Calculate date 5 days ago
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

      this.logger.log(
        `Finding Agoda jobs updated since ${fiveDaysAgo.toISOString()}`,
      );

      // Find all Agoda jobs that match criteria
      const jobs = await this.jobRepository.findJobsForAutomaticEmailCheck(
        fiveDaysAgo,
      );

      if (jobs.length === 0) {
        this.logger.log(
          'No jobs found matching criteria (Agoda, Completed, updated in last 5 days, reply_status = NoReplied or RepliedRed)',
        );
        return;
      }

      this.logger.log(
        `Found ${jobs.length} job(s) that need email check. Processing...`,
      );

      // Extract job IDs
      const jobIds = jobs.map((job) => job.id);

      // Run the support email job
      const { message, results } = await this.supportEmailService.runJob(
        jobIds,
      );

      this.logger.log(`Support email check completed: ${message}`);
      this.logger.log(
        `Results: ${results.processed.length} processed, ${results.invalid.length} invalid, ${results.errors.length} errors`,
      );
    } catch (error: any) {
      this.logger.error(
        `Error during automatic support email check: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Manual trigger method for testing
   */
  async triggerManualCheck() {
    this.logger.log('Manually triggering support email check...');
    await this.handleAutomaticSupportEmailCheck();
  }
}
