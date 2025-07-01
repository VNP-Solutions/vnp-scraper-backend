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

  async findAllByJobIdWithPagination(
    jobId: string,
    query?: Record<string, any>,
  ): Promise<{ data: JobItem[]; metadata: any }> {
    try {
      const {
        page,
        limit,
        sortBy,
        sortOrder,
        search,
        start_date,
        end_date,
        ...filters
      } = query || {};

      const skip = page
        ? (parseInt(page || '1') - 1) * parseInt(limit || '10')
        : 0;
      const take = limit ? parseInt(limit) : 10;

      let orderBy = undefined;
      if (sortBy) {
        orderBy = {
          [sortBy]: sortOrder?.toLowerCase() === 'desc' ? 'desc' : 'asc',
        };
      }

      if (start_date && end_date) {
        filters.createdAt = {
          gte: new Date(start_date),
          lte: new Date(end_date),
        };
      }

      let allFilters: any = {
        job_id: jobId,
        ...filters,
      };

      if (search) {
        allFilters = {
          ...allFilters,
          AND: [
            {
              OR: [
                {
                  guest_name: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  reservation_id: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  reasonForCharge: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              ],
            },
          ],
        };
      }

      const [jobItems, totalDocuments] = await Promise.all([
        this.db.jobItem.findMany({
          where: allFilters,
          skip,
          take,
          orderBy,
          include: {
            job: true,
            property: true,
          },
        }),
        this.db.jobItem.count({
          where: allFilters,
        }),
      ]);

      const metadata = {
        totalDocuments,
        currentPage: page ? parseInt(page) : 1,
        limit: take,
        totalPage: Math.ceil(totalDocuments / take),
      };

      return {
        data: jobItems,
        metadata,
      };
    } catch (error) {
      this.logger.error(`Error finding job items for job ${jobId}:`, error);
      return { data: [], metadata: null };
    }
  }
}
