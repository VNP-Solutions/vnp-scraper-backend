import { Injectable, Logger } from '@nestjs/common';
import { ActivityLogExport } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { IActivityLogExportRepository } from './activity-log-export.interface';

@Injectable()
export class ActivityLogExportRepository
  implements IActivityLogExportRepository
{
  private readonly logger = new Logger(ActivityLogExportRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async create(data: {
    fileName: string;
    s3Url: string;
    exportDate: Date;
  }): Promise<ActivityLogExport> {
    try {
      return await this.db.activityLogExport.create({
        data: {
          fileName: data.fileName,
          s3Url: data.s3Url,
          exportDate: data.exportDate,
        },
      });
    } catch (error) {
      this.logger.error('Error creating activity log export:', error);
      throw error;
    }
  }

  async findAll(
    query?: Record<string, any>,
  ): Promise<{ data: ActivityLogExport[]; metadata: any }> {
    try {
      const { page, limit, sortBy, sortOrder, ...filters } = query || {};
      const skip = page
        ? (parseInt(page || '1') - 1) * parseInt(limit || '10')
        : 0;
      const take = limit ? parseInt(limit) : 10;

      let orderBy = undefined;
      if (sortBy) {
        orderBy = {
          [sortBy]: sortOrder?.toLowerCase() === 'asc' ? 'asc' : 'desc',
        };
      } else {
        orderBy = {
          exportDate: 'desc',
        };
      }

      const [exports, totalDocuments] = await Promise.all([
        this.db.activityLogExport.findMany({
          skip,
          take,
          orderBy,
          where: filters,
        }),
        this.db.activityLogExport.count({
          where: filters,
        }),
      ]);

      const metadata = {
        totalDocuments,
        currentPage: page ? parseInt(page) : 1,
        limit: take,
        totalPage: Math.ceil(totalDocuments / take),
      };

      return { data: exports, metadata };
    } catch (error) {
      this.logger.error('Error fetching activity log exports:', error);
      return { data: [], metadata: null };
    }
  }

  async findById(id: string): Promise<ActivityLogExport | null> {
    try {
      return await this.db.activityLogExport.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error('Error fetching activity log export by id:', error);
      return null;
    }
  }

  async delete(id: string): Promise<ActivityLogExport> {
    try {
      return await this.db.activityLogExport.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error('Error deleting activity log export:', error);
      throw error;
    }
  }
}
