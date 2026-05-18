import { Injectable, Logger } from '@nestjs/common';
import { OtpPlatform, Server } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { IServerRepository } from './server.interface';

@Injectable()
export class ServerRepository implements IServerRepository {
  private readonly logger = new Logger(ServerRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async create(data: {
    name: string;
    url: string;
    platform?: OtpPlatform;
    is_active?: boolean;
  }): Promise<Server> {
    try {
      return await this.db.server.create({
        data: {
          name: data.name,
          url: data.url,
          platform: data.platform,
          is_active: data.is_active ?? true,
          job_count: 0,
        },
      });
    } catch (error) {
      this.logger.error('Error creating server:', error);
      throw error;
    }
  }

  async findAll(filters?: {
    search?: string;
    platform?: OtpPlatform;
    is_active?: boolean;
    page?: number;
    limit?: number;
    order?: 'asc' | 'desc';
  }): Promise<{
    servers: Server[];
    totalDocuments: number;
    currentPage: number;
    totalPage: number;
    limit: number;
  }> {
    try {
      const page = filters?.page || 1;
      const limit = filters?.limit || 10;
      const skip = (page - 1) * limit;
      const order = filters?.order || 'desc';

      const where: any = {};

      if (filters?.search) {
        const searchTerm = filters.search.toString().trim();
        const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchTerm);

        where.OR = [
          ...(isValidObjectId ? [{ id: searchTerm }] : []),
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { url: { contains: searchTerm, mode: 'insensitive' } },
        ];
      }

      if (filters?.platform !== undefined) {
        where.platform = filters.platform;
      }

      if (filters?.is_active !== undefined) {
        where.is_active = filters.is_active;
      }

      const [servers, totalDocuments] = await Promise.all([
        this.db.server.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: order },
        }),
        this.db.server.count({ where }),
      ]);

      return {
        servers,
        totalDocuments,
        currentPage: page,
        totalPage: Math.ceil(totalDocuments / limit),
        limit,
      };
    } catch (error) {
      this.logger.error('Error finding servers:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<Server | null> {
    try {
      return await this.db.server.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Error finding server by id ${id}:`, error);
      throw error;
    }
  }

  async findByName(name: string): Promise<Server | null> {
    try {
      return await this.db.server.findUnique({
        where: { name },
      });
    } catch (error) {
      this.logger.error(`Error finding server by name ${name}:`, error);
      throw error;
    }
  }

  async findAvailableServer(): Promise<Server | null> {
    try {
      return await this.db.server.findFirst({
        where: { is_active: true },
        orderBy: { job_count: 'asc' },
      });
    } catch (error) {
      this.logger.error('Error finding available server:', error);
      throw error;
    }
  }

  async findAvailableServerByPlatform(platform: OtpPlatform): Promise<Server | null> {
    try {
      return await this.db.server.findFirst({
        where: {
          is_active: true,
          platform,
        },
        orderBy: { job_count: 'asc' },
      });
    } catch (error) {
      this.logger.error(`Error finding available server for platform ${platform}:`, error);
      throw error;
    }
  }

  async update(
    id: string,
    data: {
      name?: string;
      url?: string;
      platform?: OtpPlatform;
      is_active?: boolean;
    },
  ): Promise<Server> {
    try {
      return await this.db.server.update({
        where: { id },
        data,
      });
    } catch (error) {
      this.logger.error(`Error updating server ${id}:`, error);
      throw error;
    }
  }

  async delete(id: string): Promise<Server> {
    try {
      return await this.db.server.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Error deleting server ${id}:`, error);
      throw error;
    }
  }

  async incrementJobCount(id: string): Promise<Server> {
    try {
      return await this.db.server.update({
        where: { id },
        data: {
          job_count: { increment: 1 },
        },
      });
    } catch (error) {
      this.logger.error(`Error incrementing job count for server ${id}:`, error);
      throw error;
    }
  }

  async decrementJobCount(id: string): Promise<Server> {
    try {
      return await this.db.server.update({
        where: { id },
        data: {
          job_count: { decrement: 1 },
        },
      });
    } catch (error) {
      this.logger.error(`Error decrementing job count for server ${id}:`, error);
      throw error;
    }
  }

  async bulkDelete(ids: string[]): Promise<number> {
    try {
      const result = await this.db.server.deleteMany({
        where: { id: { in: ids } },
      });

      return result.count;
    } catch (error) {
      this.logger.error('Error bulk deleting servers:', error);
      throw error;
    }
  }

  // ========== Date-Based Scheduling Methods ==========

  /**
   * Find an active server for a specific date (least loaded first).
   * No capacity limit is enforced — the global queue handles distribution.
   */
  async findAvailableServerForDate(date: string): Promise<Server | null> {
    try {
      const servers = await this.db.server.findMany({
        where: { is_active: true },
        include: {
          dailySchedules: {
            where: { date },
          },
        },
      });

      if (servers.length === 0) return null;

      // Sort by fewest assigned jobs first (best distribution)
      const sorted = servers
        .map((server) => {
          const dailySchedule = server.dailySchedules[0];
          const assignedJobs = dailySchedule?.assigned_jobs || 0;
          return { server, assignedJobs };
        })
        .sort((a, b) => a.assignedJobs - b.assignedJobs);

      return sorted[0].server;
    } catch (error) {
      this.logger.error(`Error finding available server for date ${date}:`, error);
      throw error;
    }
  }

  /**
   * Increment job count for a server on a specific date
   */
  async incrementDateCapacity(serverId: string, date: string): Promise<void> {
    try {
      // Upsert: create if doesn't exist, increment if exists
      await this.db.serverDailySchedule.upsert({
        where: {
          server_id_date: {
            server_id: serverId,
            date: date,
          },
        },
        update: {
          assigned_jobs: { increment: 1 },
        },
        create: {
          server_id: serverId,
          date: date,
          assigned_jobs: 1,
        },
      });
    } catch (error) {
      this.logger.error(`Error incrementing capacity for server ${serverId} on date ${date}:`, error);
      throw error;
    }
  }

  /**
   * Decrement job count for a server on a specific date
   */
  async decrementDateCapacity(serverId: string, date: string): Promise<void> {
    try {
      const schedule = await this.db.serverDailySchedule.findUnique({
        where: {
          server_id_date: {
            server_id: serverId,
            date: date,
          },
        },
      });

      if (!schedule) {
        this.logger.warn(`No schedule found for server ${serverId} on date ${date}`);
        return;
      }

      if (schedule.assigned_jobs <= 0) {
        this.logger.warn(`Assigned jobs already 0 for server ${serverId} on date ${date}`);
        return;
      }

      await this.db.serverDailySchedule.update({
        where: {
          server_id_date: {
            server_id: serverId,
            date: date,
          },
        },
        data: {
          assigned_jobs: { decrement: 1 },
        },
      });
    } catch (error) {
      this.logger.error(`Error decrementing capacity for server ${serverId} on date ${date}:`, error);
      throw error;
    }
  }

  /**
   * Get server's daily schedule for a specific date
   */
  async getServerScheduleForDate(serverId: string, date: string) {
    try {
      const server = await this.db.server.findUnique({
        where: { id: serverId },
        include: {
          dailySchedules: {
            where: { date },
          },
        },
      });

      if (!server) return null;

      const dailySchedule = server.dailySchedules[0];
      const assignedJobs = dailySchedule?.assigned_jobs || 0;

      return {
        server,
        assignedJobs,
        availableCapacity: server.max_concurrent_jobs - assignedJobs,
      };
    } catch (error) {
      this.logger.error(`Error getting schedule for server ${serverId} on date ${date}:`, error);
      throw error;
    }
  }

  /**
   * Get all daily schedules for a server (for monitoring/analytics)
   */
  async getServerDailySchedules(serverId: string, filters?: {
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    try {
      const page = filters?.page || 1;
      const limit = filters?.limit || 30;
      const skip = (page - 1) * limit;

      const where: any = { server_id: serverId };

      if (filters?.startDate || filters?.endDate) {
        where.date = {};
        if (filters.startDate) where.date.gte = filters.startDate;
        if (filters.endDate) where.date.lte = filters.endDate;
      }

      const [schedules, total] = await Promise.all([
        this.db.serverDailySchedule.findMany({
          where,
          skip,
          take: limit,
          orderBy: { date: 'desc' },
        }),
        this.db.serverDailySchedule.count({ where }),
      ]);

      return {
        schedules,
        totalDocuments: total,
        currentPage: page,
        totalPage: Math.ceil(total / limit),
        limit,
      };
    } catch (error) {
      this.logger.error(`Error getting daily schedules for server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Update job assignment when a job's schedule_date changes
   * Decrements old date, increments new date
   */
  async moveJobBetweenDates(
    serverId: string,
    oldDate: string,
    newDate: string,
  ): Promise<void> {
    try {
      // Decrement old date
      await this.decrementDateCapacity(serverId, oldDate);
      
      // Increment new date
      await this.incrementDateCapacity(serverId, newDate);
      
      this.logger.log(`Moved job for server ${serverId} from ${oldDate} to ${newDate}`);
    } catch (error) {
      this.logger.error(`Error moving job between dates for server ${serverId}:`, error);
      throw error;
    }
  }
}
