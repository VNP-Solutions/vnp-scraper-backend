import { Inject, Injectable, Logger } from '@nestjs/common';
import { Job, OTAProvider } from '@prisma/client';
import { CreateJobDto, UpdateJobDto } from './job.dto';
import { IJobRepository, IJobService } from './job.interface';
import { BookingJobRouterService } from './booking-job-router.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class JobService implements IJobService {
  constructor(
    @Inject('IJobRepository')
    private readonly repository: IJobRepository,
    private readonly logger: Logger,
    private readonly bookingJobRouter: BookingJobRouterService,
    private readonly db: DatabaseService,
  ) {}

  async createJob(data: CreateJobDto): Promise<Job> {
    try {
      // Check if this is a Booking.com job and property needs trust verification
      if (data.ota_provider === OTAProvider.Booking && data.property_id) {
        const trustStatus = await this.bookingJobRouter.getPropertyTrustStatus(data.property_id);
        
        if (trustStatus.needsVerification) {
          this.logger.log(
            `Booking job for property ${data.property_id} requires trust verification first. ` +
            `Status: ${trustStatus.trustStatus}, Score: ${trustStatus.trustScore}, ` +
            `Hours since login: ${trustStatus.hoursSinceLastLogin.toFixed(1)}`,
          );
          
          // Add a note to the job about trust verification requirement
          data.log_link = `Trust verification required - ${trustStatus.trustStatus} (${trustStatus.hoursSinceLastLogin.toFixed(1)}h since last login)`;
        }
      }
      
      const job = await this.repository.create(data);
      
      // If it's a Booking job, check if we should trigger trust verification immediately
      if (job.ota_provider === OTAProvider.Booking && job.property_id) {
        this.triggerBookingJobProcessing(job);
      }
      
      return job;
    } catch (error) {
      this.logger.error(`Error creating job: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Trigger processing for a booking job (trust verification if needed, then scraping)
   */
  private async triggerBookingJobProcessing(job: Job): Promise<void> {
    try {
      // Process in background, don't wait
      setImmediate(async () => {
        try {
          await this.bookingJobRouter.processBookingJob(job);
        } catch (error) {
          this.logger.error(
            `Background processing failed for booking job ${job.id}: ${error.message}`,
            error.stack,
          );
        }
      });
    } catch (error) {
      this.logger.error(
        `Error triggering booking job processing for job ${job.id}: ${error.message}`,
        error.stack,
      );
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
}
