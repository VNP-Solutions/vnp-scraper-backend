import { Inject, Injectable, Logger } from '@nestjs/common';
import { JobItem } from '@prisma/client';
import {
  IScraperJobItemRepository,
  IScraperJobItemService,
} from './scraper-job-item.interface';

@Injectable()
export class ScraperJobItemService implements IScraperJobItemService {
  constructor(
    @Inject('IScraperJobItemRepository')
    private readonly jobItemRepository: IScraperJobItemRepository,
    private readonly logger: Logger,
  ) {}

  async getAllJobItemsByJobId(jobId: string): Promise<JobItem[]> {
    try {
      const jobItems = await this.jobItemRepository.findAllByJobId(jobId);
      return jobItems;
    } catch (error) {
      this.logger.error(
        `Error getting job items for job ${jobId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
