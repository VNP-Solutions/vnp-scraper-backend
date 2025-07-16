/**
 * Example: How to integrate Job Queue URL system into existing scraper workflow
 *
 * This example shows how to modify existing scraper methods to use the job queue
 * for automatic URL booking and management.
 */

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { IJobQueueUrlService } from '../src/module/job-queue-url/job-queue-url.interface';

@Injectable()
export class EnhancedScraperService {
  constructor(
    @Inject('IJobQueueUrlService')
    private readonly jobQueueUrlService: IJobQueueUrlService,
    // ... other existing dependencies
  ) {}

  /**
   * Enhanced property run job that automatically books a URL from the queue
   */
  async propertyRunJobWithAutoBooking(jobId: string, requestData: any) {
    try {
      // Step 1: Book an available URL for this job
      const bookingResult =
        await this.jobQueueUrlService.bookAvailableUrl(jobId);

      if (!bookingResult.success) {
        return {
          success: false,
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: bookingResult.message,
          data: null,
        };
      }

      const assignedUrl = bookingResult.url!;
      console.log(`Job ${jobId} assigned to server: ${assignedUrl.url}`);

      try {
        // Step 2: Execute the scraping job using the assigned URL
        const scrapingResult = await this.executeScrapingJob(
          assignedUrl.url,
          requestData,
        );

        // Step 3: Release the URL back to the queue when job completes
        await this.jobQueueUrlService.releaseUrl(assignedUrl.id);
        console.log(`Released URL ${assignedUrl.url} back to queue`);

        return {
          success: true,
          statusCode: HttpStatus.OK,
          message: 'Scraping job completed successfully',
          data: {
            jobId,
            serverUsed: assignedUrl.url,
            results: scrapingResult,
          },
        };
      } catch (scrapingError: any) {
        // Step 4: Ensure URL is released even if scraping fails
        await this.jobQueueUrlService.releaseUrl(assignedUrl.id);
        console.log(`Released URL ${assignedUrl.url} due to scraping error`);

        throw scrapingError;
      }
    } catch (error: any) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: `Job execution failed: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * Enhanced reservation run job with automatic URL management
   */
  async reservationRunJobWithAutoBooking(jobId: string, reservations: any[]) {
    const bookingResult = await this.jobQueueUrlService.bookAvailableUrl(jobId);

    if (!bookingResult.success) {
      return {
        success: false,
        message: bookingResult.message,
      };
    }

    const assignedUrl = bookingResult.url!;

    try {
      // Process reservations using the assigned server
      const results = await this.processReservations(
        assignedUrl.url,
        reservations,
      );

      // Release URL when done
      await this.jobQueueUrlService.releaseUrl(assignedUrl.id);

      return {
        success: true,
        message: 'Reservation processing completed',
        data: results,
        serverUsed: assignedUrl.url,
      };
    } catch (error: any) {
      // Always release URL, even on error
      await this.jobQueueUrlService.releaseUrl(assignedUrl.id);
      throw error;
    }
  }

  /**
   * Get current queue status for monitoring
   */
  async getQueueStatus() {
    const stats = await this.jobQueueUrlService.getQueueStatistics();
    const availableUrls = await this.jobQueueUrlService.getAvailableUrls();

    return {
      statistics: stats,
      availableServers: availableUrls.map((url) => ({
        id: url.id,
        name: url.name,
        url: url.url,
        priority: url.priority,
        currentLoad: `${url.current_job_count}/${url.max_concurrent_jobs}`,
        lastUsed: url.last_used,
      })),
      queueHealth: {
        isHealthy: stats.available > 0,
        utilizationPercentage:
          stats.totalCapacity > 0
            ? Math.round((stats.currentUsage / stats.totalCapacity) * 100)
            : 0,
        recommendations: this.generateRecommendations(stats),
      },
    };
  }

  /**
   * Generate system recommendations based on queue statistics
   */
  private generateRecommendations(stats: any): string[] {
    const recommendations: string[] = [];

    if (stats.available === 0) {
      recommendations.push(
        'All servers are busy. Consider adding more servers.',
      );
    }

    if (stats.offline > 0) {
      recommendations.push(
        `${stats.offline} servers are offline. Check server health.`,
      );
    }

    if (stats.maintenance > 0) {
      recommendations.push(
        `${stats.maintenance} servers are in maintenance mode.`,
      );
    }

    const utilizationRate =
      stats.totalCapacity > 0
        ? (stats.currentUsage / stats.totalCapacity) * 100
        : 0;

    if (utilizationRate > 80) {
      recommendations.push(
        'High server utilization detected. Consider scaling up.',
      );
    }

    if (utilizationRate < 20 && stats.total > 2) {
      recommendations.push(
        'Low server utilization. Some servers may be underused.',
      );
    }

    return recommendations;
  }

  /**
   * Emergency function to release all stuck URLs
   */
  async releaseAllStuckUrls() {
    const bookedUrls = await this.jobQueueUrlService.getUrlsByStatus('Booked');
    const releasedUrls = [];

    for (const url of bookedUrls) {
      try {
        await this.jobQueueUrlService.releaseUrl(url.id);
        releasedUrls.push(url.url);
      } catch (error: any) {
        console.error(`Failed to release URL ${url.url}:`, error.message);
      }
    }

    return {
      message: `Released ${releasedUrls.length} URLs`,
      releasedUrls,
    };
  }

  // Placeholder methods - replace with actual implementation
  private async executeScrapingJob(serverUrl: string, requestData: any) {
    // Implementation would make HTTP calls to the assigned server
    console.log(`Executing scraping job on ${serverUrl}`);
    return { jobData: 'sample result' };
  }

  private async processReservations(serverUrl: string, reservations: any[]) {
    // Implementation would process reservations using the assigned server
    console.log(
      `Processing ${reservations.length} reservations on ${serverUrl}`,
    );
    return { processed: reservations.length };
  }
}

/**
 * Example usage in a controller:
 */
export class ExampleControllerIntegration {
  constructor(
    private readonly enhancedScraperService: EnhancedScraperService,
    @Inject('IJobQueueUrlService')
    private readonly jobQueueUrlService: IJobQueueUrlService,
  ) {}

  /**
   * Setup some initial URLs for the queue
   */
  async setupInitialQueue() {
    const serversToAdd = [
      {
        name: 'Primary Scraper Server',
        url: 'http://scraper-1.example.com:3000',
        description: 'Main production scraper server',
        priority: 10,
        max_concurrent_jobs: 3,
      },
      {
        name: 'Secondary Scraper Server',
        url: 'http://scraper-2.example.com:3000',
        description: 'Backup scraper server',
        priority: 8,
        max_concurrent_jobs: 2,
      },
      {
        name: 'Development Scraper Server',
        url: 'http://scraper-dev.example.com:3000',
        description: 'Development testing server',
        priority: 5,
        max_concurrent_jobs: 1,
      },
    ];

    const results = [];
    for (const server of serversToAdd) {
      try {
        const created = await this.jobQueueUrlService.createUrl(server);
        results.push(created);
      } catch (error: any) {
        console.log(
          `Server ${server.url} already exists or error:`,
          error.message,
        );
      }
    }

    return {
      message: `Queue setup complete. Added ${results.length} servers.`,
      servers: results,
    };
  }

  /**
   * Monitor and manage the queue health
   */
  async manageQueueHealth() {
    const status = await this.enhancedScraperService.getQueueStatus();

    // Auto-recovery: bring offline servers back online if needed
    if (status.statistics.available === 0 && status.statistics.offline > 0) {
      console.log('No available servers. Attempting auto-recovery...');

      const offlineUrls =
        await this.jobQueueUrlService.getUrlsByStatus('Offline');
      for (const url of offlineUrls.slice(0, 2)) {
        // Bring back max 2 servers
        try {
          await this.jobQueueUrlService.setUrlOnline(url.id);
          console.log(`Brought server ${url.url} back online`);
        } catch (error: any) {
          console.error(`Failed to bring ${url.url} online:`, error.message);
        }
      }
    }

    return status;
  }
}
