import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JobQueueUrlStatus } from '@prisma/client';
import {
  CreateJobQueueUrlData,
  IJobQueueUrl,
  IJobQueueUrlRepository,
  IJobQueueUrlService,
  UpdateJobQueueUrlData,
} from './job-queue-url.interface';

@Injectable()
export class JobQueueUrlService implements IJobQueueUrlService {
  constructor(
    @Inject('IJobQueueUrlRepository')
    private readonly repository: IJobQueueUrlRepository,
    private readonly logger: Logger,
  ) {}

  async createUrl(data: CreateJobQueueUrlData): Promise<IJobQueueUrl> {
    try {
      // Check if URL already exists
      const existingUrl = await this.repository.findByUrl(data.url);
      if (existingUrl) {
        throw new ConflictException('URL already exists in the queue');
      }

      return await this.repository.create(data);
    } catch (error: any) {
      this.logger.error(
        `Error creating job queue URL: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getUrlById(id: string): Promise<IJobQueueUrl> {
    try {
      const url = await this.repository.findById(id);
      if (!url) {
        throw new NotFoundException('URL not found');
      }
      return url;
    } catch (error: any) {
      this.logger.error(
        `Error getting URL by ID ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAllUrls(): Promise<IJobQueueUrl[]> {
    try {
      return await this.repository.findAll();
    } catch (error: any) {
      this.logger.error(
        `Error getting all URLs: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateUrl(
    id: string,
    data: UpdateJobQueueUrlData,
  ): Promise<IJobQueueUrl> {
    try {
      // Check if URL exists
      const existingUrl = await this.repository.findById(id);
      if (!existingUrl) {
        throw new NotFoundException('URL not found');
      }

      // If updating URL, check for conflicts
      if (data.url && data.url !== existingUrl.url) {
        const urlExists = await this.repository.findByUrl(data.url);
        if (urlExists) {
          throw new ConflictException('URL already exists in the queue');
        }
      }

      return await this.repository.update(id, data);
    } catch (error: any) {
      this.logger.error(
        `Error updating URL ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async deleteUrl(id: string): Promise<void> {
    try {
      const existingUrl = await this.repository.findById(id);
      if (!existingUrl) {
        throw new NotFoundException('URL not found');
      }

      // Check if URL is currently in use
      if (
        existingUrl.status === JobQueueUrlStatus.Booked ||
        existingUrl.current_job_count > 0
      ) {
        throw new ConflictException(
          'Cannot delete URL that is currently in use',
        );
      }

      await this.repository.delete(id);
    } catch (error: any) {
      this.logger.error(
        `Error deleting URL ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAvailableUrls(): Promise<IJobQueueUrl[]> {
    try {
      return await this.repository.findAvailableUrls();
    } catch (error: any) {
      this.logger.error(
        `Error getting available URLs: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async bookAvailableUrl(jobId: string): Promise<{
    success: boolean;
    url?: IJobQueueUrl;
    message: string;
  }> {
    try {
      // Find an available URL
      const availableUrl = await this.repository.findAvailableUrlForBooking();

      if (!availableUrl) {
        return {
          success: false,
          message: 'All servers are busy. No available URLs for booking.',
        };
      }

      try {
        // Book the URL
        const bookedUrl = await this.repository.bookUrl(availableUrl.id, jobId);
        return {
          success: true,
          url: bookedUrl,
          message: 'URL booked successfully',
        };
      } catch (error: any) {
        return {
          success: false,
          message: `Failed to book URL: ${error.message}`,
        };
      }
    } catch (error: any) {
      this.logger.error(
        `Error booking URL for job ${jobId}: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        message: `Failed to book URL: ${error.message}`,
      };
    }
  }

  async releaseUrl(urlId: string): Promise<IJobQueueUrl> {
    try {
      const url = await this.repository.findById(urlId);
      if (!url) {
        throw new NotFoundException('URL not found');
      }

      return await this.repository.releaseUrl(urlId);
    } catch (error: any) {
      this.logger.error(
        `Error releasing URL ${urlId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getUrlsByStatus(status: JobQueueUrlStatus): Promise<IJobQueueUrl[]> {
    try {
      return await this.repository.findByStatus(status);
    } catch (error: any) {
      this.logger.error(
        `Error getting URLs by status ${status}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // Additional utility methods

  async getQueueStatistics(): Promise<{
    total: number;
    available: number;
    booked: number;
    maintenance: number;
    offline: number;
    totalCapacity: number;
    currentUsage: number;
  }> {
    try {
      const allUrls = await this.repository.findAll();

      const stats = {
        total: allUrls.length,
        available: allUrls.filter(
          (url) => url.status === JobQueueUrlStatus.Available && url.is_active,
        ).length,
        booked: allUrls.filter((url) => url.status === JobQueueUrlStatus.Booked)
          .length,
        maintenance: allUrls.filter(
          (url) => url.status === JobQueueUrlStatus.Maintenance,
        ).length,
        offline: allUrls.filter(
          (url) => url.status === JobQueueUrlStatus.Offline || !url.is_active,
        ).length,
        totalCapacity: allUrls.reduce(
          (sum, url) => sum + url.max_concurrent_jobs,
          0,
        ),
        currentUsage: allUrls.reduce(
          (sum, url) => sum + url.current_job_count,
          0,
        ),
      };

      return stats;
    } catch (error: any) {
      this.logger.error(
        `Error getting queue statistics: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getUrlUsageDetails(): Promise<IJobQueueUrl[]> {
    const allUrls = await this.repository.findAll();
    return allUrls.map((url) => ({
      ...url,
      usagePercentage:
        url.max_concurrent_jobs > 0
          ? Math.round((url.current_job_count / url.max_concurrent_jobs) * 100)
          : 0,
    })) as IJobQueueUrl[];
  }

  async setUrlMaintenance(id: string): Promise<IJobQueueUrl> {
    try {
      const url = await this.getUrlById(id);

      if (url.current_job_count > 0) {
        throw new ConflictException(
          'Cannot set URL to maintenance while jobs are running',
        );
      }

      return await this.repository.update(id, {
        status: JobQueueUrlStatus.Maintenance,
      });
    } catch (error: any) {
      this.logger.error(
        `Error setting URL ${id} to maintenance: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async setUrlOffline(id: string): Promise<IJobQueueUrl> {
    try {
      return await this.repository.update(id, {
        status: JobQueueUrlStatus.Offline,
        is_active: false,
      });
    } catch (error: any) {
      this.logger.error(
        `Error setting URL ${id} offline: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async setUrlOnline(id: string): Promise<IJobQueueUrl> {
    try {
      return await this.repository.update(id, {
        status: JobQueueUrlStatus.Available,
        is_active: true,
      });
    } catch (error: any) {
      this.logger.error(
        `Error setting URL ${id} online: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
