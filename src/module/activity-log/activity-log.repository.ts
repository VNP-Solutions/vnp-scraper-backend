import { Injectable, Logger } from '@nestjs/common';
import { ActivityLog } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { IActivityLogRepository } from './activity-log.interface';

@Injectable()
export class ActivityLogRepository implements IActivityLogRepository {
  private readonly logger = new Logger(ActivityLogRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async create(data: {
    username: string;
    role: string;
    endpoint: string;
    success: boolean;
    statusCode: number;
    ipAddress: string;
    resource: string;
    responseTime: number;
  }): Promise<ActivityLog> {
    try {
      return await this.db.activityLog.create({
        data: {
          username: data.username,
          role: data.role,
          endpoint: data.endpoint,
          success: data.success,
          statusCode: data.statusCode,
          ipAddress: data.ipAddress,
          resource: data.resource,
          responseTime: data.responseTime,
        },
      });
    } catch (error) {
      this.logger.error('Error creating activity log:', error);
      throw error;
    }
  }

  async findAll(
    query?: Record<string, any>,
  ): Promise<{ data: ActivityLog[]; metadata: any }> {
    try {
      const {
        page,
        limit,
        sortBy,
        sortOrder,
        search,
        start_date,
        end_date,
        success,
        role,
        resource,
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
      } else {
        orderBy = {
          timestamp: 'desc',
        };
      }

      let allFilters = { ...filters };

      // Build additional conditions array
      const additionalConditions = [];

      if (search) {
        additionalConditions.push({
          OR: [
            {
              username: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              endpoint: {
                contains: search,
                mode: 'insensitive',
              },
            },
          ],
        });
      }

      if (start_date && end_date) {
        additionalConditions.push({
          timestamp: {
            gte: new Date(start_date),
            lte: new Date(end_date),
          },
        });
      }

      if (success !== undefined) {
        additionalConditions.push({
          success: success,
        });
      }

      if (role) {
        additionalConditions.push({
          role: role,
        });
      }

      if (resource) {
        additionalConditions.push({
          resource: resource,
        });
      }

      // Combine base filters with additional conditions
      if (additionalConditions.length > 0) {
        allFilters = {
          ...allFilters,
          AND: additionalConditions,
        };
      }

      const [logs, totalDocuments] = await Promise.all([
        this.db.activityLog.findMany({
          skip,
          take,
          orderBy,
          where: allFilters,
        }),
        this.db.activityLog.count({
          where: allFilters,
        }),
      ]);

      const metadata = {
        totalDocuments,
        currentPage: page ? parseInt(page) : 1,
        limit: take,
        totalPage: Math.ceil(totalDocuments / take),
      };

      return { data: logs, metadata };
    } catch (error) {
      this.logger.error('Error fetching activity logs:', error);
      return { data: [], metadata: null };
    }
  }

  async delete(id: string): Promise<ActivityLog> {
    try {
      return await this.db.activityLog.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error('Error deleting activity log:', error);
      throw error;
    }
  }

  async deleteMany(): Promise<{ count: number }> {
    try {
      return await this.db.activityLog.deleteMany({});
    } catch (error) {
      this.logger.error('Error deleting all activity logs:', error);
      throw error;
    }
  }

  async getUserDetails(
    userId: string,
  ): Promise<{ name: string; role: string } | null> {
    try {
      return await this.db.user.findUnique({
        where: { id: userId },
        select: { name: true, role: true },
      });
    } catch (error) {
      this.logger.error('Error fetching user details:', error);
      return null;
    }
  }
}
