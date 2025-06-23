import { Injectable, Logger } from '@nestjs/common';
import { JobItem } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { IScraperJobItemRepository } from './scraper-job-item.interface';

@Injectable()
export class ScraperJobItemRepository implements IScraperJobItemRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  async findAllByJobId(jobId: string): Promise<JobItem[]> {
    try {
      const jobItems = await this.db.jobItem.findMany({
        where: { job_id: jobId },
        include: {
          job: true,
          property: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      return jobItems;
    } catch (error) {
      this.logger.error(`Error finding job items for job ${jobId}:`, error);
      throw error;
    }
  }
}
