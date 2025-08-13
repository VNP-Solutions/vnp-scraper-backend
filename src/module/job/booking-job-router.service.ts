import { Injectable, Logger } from '@nestjs/common';
import { Job, Property, OTAProvider } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import axios from 'axios';

export enum BookingJobType {
  TRUST_VERIFICATION = 'trust_verification',
  REGULAR_SCRAPING = 'regular_scraping',
}

export interface BookingJobRouting {
  jobType: BookingJobType;
  shouldRunTrustFirst: boolean;
  trustStatus: string;
  trustScore: number;
  message: string;
}

@Injectable()
export class BookingJobRouterService {
  private readonly MODULAR_SCRAPER_URL = process.env.MODULAR_SCRAPER_URL || 'http://localhost:3000';
  
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  /**
   * Determines whether a booking job should go through trust verification or regular scraping
   */
  async determineJobRouting(job: Job): Promise<BookingJobRouting> {
    try {
      // Only process Booking.com jobs
      if (job.ota_provider !== OTAProvider.Booking) {
        return {
          jobType: BookingJobType.REGULAR_SCRAPING,
          shouldRunTrustFirst: false,
          trustStatus: 'n/a',
          trustScore: 0,
          message: 'Not a Booking.com job',
        };
      }

      // Get the property to check trust status
      const property = await this.db.property.findUnique({
        where: { id: job.property_id },
      });

      if (!property) {
        throw new Error(`Property ${job.property_id} not found for job ${job.id}`);
      }

      // Check if property has booking_id
      if (!property.booking_id || property.booking_id <= 0) {
        return {
          jobType: BookingJobType.REGULAR_SCRAPING,
          shouldRunTrustFirst: false,
          trustStatus: 'no_booking_id',
          trustScore: 0,
          message: 'Property has no valid booking_id',
        };
      }

      const trustStatus = property.booking_trusted_status || 'not_trusted';
      const trustScore = property.booking_trust_score || 0;
      const lastLogin = property.booking_last_login;
      
      // Calculate hours since last login
      const hoursSinceLastLogin = lastLogin 
        ? (Date.now() - new Date(lastLogin).getTime()) / (1000 * 60 * 60)
        : 999; // High number if never logged in

      // Determine if trust verification is needed
      if (trustStatus === 'not_trusted') {
        // Not trusted properties need trust verification if:
        // - Never logged in (lastLogin is null)
        // - Last login was more than 23 hours ago
        if (!lastLogin || hoursSinceLastLogin >= 23) {
          return {
            jobType: BookingJobType.TRUST_VERIFICATION,
            shouldRunTrustFirst: true,
            trustStatus,
            trustScore,
            message: `Property not trusted, needs verification (${hoursSinceLastLogin.toFixed(1)} hours since last login)`,
          };
        }
      } else if (trustStatus === 'trusted') {
        // Trusted properties need verification if:
        // - Last login was more than 7 days ago (weekly maintenance)
        if (!lastLogin || hoursSinceLastLogin >= 168) { // 7 days = 168 hours
          return {
            jobType: BookingJobType.TRUST_VERIFICATION,
            shouldRunTrustFirst: true,
            trustStatus,
            trustScore,
            message: `Trusted property needs weekly maintenance (${(hoursSinceLastLogin / 24).toFixed(1)} days since last login)`,
          };
        }
      }

      // Property is trusted and recently verified, proceed with regular scraping
      return {
        jobType: BookingJobType.REGULAR_SCRAPING,
        shouldRunTrustFirst: false,
        trustStatus,
        trustScore,
        message: `Property trusted and recently verified (${hoursSinceLastLogin.toFixed(1)} hours ago), proceeding with scraping`,
      };
    } catch (error) {
      this.logger.error(
        `Error determining job routing for job ${job.id}: ${error.message}`,
        error.stack,
      );
      
      // Default to regular scraping on error
      return {
        jobType: BookingJobType.REGULAR_SCRAPING,
        shouldRunTrustFirst: false,
        trustStatus: 'error',
        trustScore: 0,
        message: `Error determining routing: ${error.message}`,
      };
    }
  }

  /**
   * Execute trust verification for a property
   */
  async executeTrustVerification(propertyId: string): Promise<boolean> {
    try {
      this.logger.log(`Executing trust verification for property ${propertyId}`);
      
      // Call the modular scraper's trust verification endpoint
      const response = await axios.post(
        `${this.MODULAR_SCRAPER_URL}/api/booking/trust-scheduler/verify/${propertyId}`,
        {},
        {
          timeout: 60000, // 1 minute timeout
        }
      );

      if (response.data.success) {
        const result = response.data.data;
        this.logger.log(
          `Trust verification completed for property ${propertyId}: ${result.newStatus} (score: ${result.trustScore || 0})`,
        );
        
        // Update property trust status in our database
        await this.db.property.update({
          where: { id: propertyId },
          data: {
            booking_trusted_status: result.newStatus,
            booking_trust_score: result.trustScore || 0,
            booking_last_login: new Date(),
          },
        });
        
        return result.newStatus === 'trusted';
      } else {
        this.logger.warn(
          `Trust verification failed for property ${propertyId}: ${response.data.error}`,
        );
        return false;
      }
    } catch (error) {
      this.logger.error(
        `Error executing trust verification for property ${propertyId}: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Process a booking job with appropriate routing
   */
  async processBookingJob(job: Job): Promise<void> {
    try {
      const routing = await this.determineJobRouting(job);
      
      this.logger.log(
        `Job ${job.id} routing: ${routing.jobType} - ${routing.message}`,
      );

      if (routing.shouldRunTrustFirst) {
        // Execute trust verification first
        const isTrusted = await this.executeTrustVerification(job.property_id);
        
        if (!isTrusted) {
          this.logger.warn(
            `Property ${job.property_id} failed trust verification, job ${job.id} cannot proceed`,
          );
          
          // Update job status to indicate trust verification failed
          await this.db.job.update({
            where: { id: job.id },
            data: {
              job_status: 'Failed',
              log_link: 'Property not trusted - trust verification required',
            },
          });
          return;
        }
      }

      // Proceed with regular scraping
      this.logger.log(`Proceeding with regular scraping for job ${job.id}`);
      
      // Call the modular scraper's job execution endpoint
      // This would be implemented based on your existing job execution logic
      await this.executeRegularScraping(job);
    } catch (error) {
      this.logger.error(
        `Error processing booking job ${job.id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Execute regular scraping job
   */
  private async executeRegularScraping(job: Job): Promise<void> {
    try {
      // This would call your existing scraping endpoint
      // Implementation depends on your current job execution flow
      const response = await axios.post(
        `${this.MODULAR_SCRAPER_URL}/api/booking/scrape`,
        {
          jobId: job.id,
          propertyId: job.property_id,
          startDate: job.start_date,
          endDate: job.end_date,
          // Add other necessary job parameters
        },
        {
          timeout: 300000, // 5 minute timeout for scraping
        }
      );

      if (response.data.success) {
        this.logger.log(`Scraping completed successfully for job ${job.id}`);
      } else {
        this.logger.error(`Scraping failed for job ${job.id}: ${response.data.error}`);
      }
    } catch (error) {
      this.logger.error(
        `Error executing scraping for job ${job.id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get trust verification status for a property
   */
  async getPropertyTrustStatus(propertyId: string): Promise<{
    needsVerification: boolean;
    trustStatus: string;
    trustScore: number;
    lastLogin: Date | null;
    hoursSinceLastLogin: number;
  }> {
    try {
      const property = await this.db.property.findUnique({
        where: { id: propertyId },
      });

      if (!property) {
        throw new Error(`Property ${propertyId} not found`);
      }

      const trustStatus = property.booking_trusted_status || 'not_trusted';
      const trustScore = property.booking_trust_score || 0;
      const lastLogin = property.booking_last_login;
      
      const hoursSinceLastLogin = lastLogin 
        ? (Date.now() - new Date(lastLogin).getTime()) / (1000 * 60 * 60)
        : 999;

      let needsVerification = false;
      
      if (trustStatus === 'not_trusted' && (!lastLogin || hoursSinceLastLogin >= 23)) {
        needsVerification = true;
      } else if (trustStatus === 'trusted' && (!lastLogin || hoursSinceLastLogin >= 168)) {
        needsVerification = true;
      }

      return {
        needsVerification,
        trustStatus,
        trustScore,
        lastLogin,
        hoursSinceLastLogin,
      };
    } catch (error) {
      this.logger.error(
        `Error getting trust status for property ${propertyId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}