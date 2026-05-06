import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Server } from '@prisma/client';
import { IServerService } from './server.interface';
import { ServerRepository } from './server.repository';

@Injectable()
export class ServerService implements IServerService {
  private readonly logger = new Logger(ServerService.name);

  constructor(private readonly repository: ServerRepository) {}

  async createServer(data: {
    name: string;
    url: string;
    is_active?: boolean;
  }): Promise<Server> {
    try {
      // Check if server with same name already exists
      const existingServer = await this.repository.findByName(data.name);
      if (existingServer) {
        throw new ConflictException(
          `Server with name "${data.name}" already exists`,
        );
      }

      const server = await this.repository.create(data);

      this.logger.log(`Server created: ${server.name} (ID: ${server.id})`);

      return server;
    } catch (error) {
      this.logger.error('Error creating server:', error);
      throw error;
    }
  }

  async findAllServers(filters?: {
    search?: string;
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
      return await this.repository.findAll(filters);
    } catch (error) {
      this.logger.error('Error finding servers:', error);
      throw error;
    }
  }

  async findServerById(id: string): Promise<Server> {
    try {
      const server = await this.repository.findById(id);

      if (!server) {
        throw new NotFoundException(`Server with ID ${id} not found`);
      }

      return server;
    } catch (error) {
      this.logger.error(`Error finding server by ID ${id}:`, error);
      throw error;
    }
  }

  async findAvailableServer(): Promise<Server | null> {
    try {
      const server = await this.repository.findAvailableServer();

      if (!server) {
        this.logger.warn('No available server found (all servers are at capacity or inactive)');
      }

      return server;
    } catch (error) {
      this.logger.error('Error finding available server:', error);
      throw error;
    }
  }

  async updateServer(
    id: string,
    data: {
      name?: string;
      url?: string;
      is_active?: boolean;
    },
  ): Promise<Server> {
    try {
      // Check if server exists
      const existingServer = await this.repository.findById(id);
      if (!existingServer) {
        throw new NotFoundException(`Server with ID ${id} not found`);
      }

      // If updating name, check for name conflicts
      if (data.name && data.name !== existingServer.name) {
        const serverWithSameName = await this.repository.findByName(data.name);
        if (serverWithSameName) {
          throw new ConflictException(
            `Server with name "${data.name}" already exists`,
          );
        }
      }

      const updatedServer = await this.repository.update(id, data);

      this.logger.log(`Server updated: ${updatedServer.name} (ID: ${id})`);

      return updatedServer;
    } catch (error) {
      this.logger.error(`Error updating server ${id}:`, error);
      throw error;
    }
  }

  async deleteServer(id: string): Promise<{ deletedCount: number; deletedId: string }> {
    try {
      // Check if server exists
      const server = await this.repository.findById(id);
      if (!server) {
        throw new NotFoundException(`Server with ID ${id} not found`);
      }

      // Check if server has active jobs
      if (server.job_count > 0) {
        throw new BadRequestException(
          `Cannot delete server "${server.name}" because it has ${server.job_count} active job(s)`,
        );
      }

      await this.repository.delete(id);

      this.logger.log(`Server deleted: ${server.name} (ID: ${id})`);

      return {
        deletedCount: 1,
        deletedId: id,
      };
    } catch (error) {
      this.logger.error(`Error deleting server ${id}:`, error);
      throw error;
    }
  }

  async bulkDeleteServers(ids: string[]): Promise<{
    deletedCount: number;
    deletedIds: string[];
  }> {
    try {
      if (!ids || ids.length === 0) {
        throw new BadRequestException('No IDs provided for deletion');
      }

      // Check each server for active jobs
      const servers = await Promise.all(
        ids.map((id) => this.repository.findById(id)),
      );

      const serversWithJobs = servers.filter((s) => s && s.job_count > 0);
      if (serversWithJobs.length > 0) {
        const serverNames = serversWithJobs.map((s) => s!.name).join(', ');
        throw new BadRequestException(
          `Cannot delete servers [${serverNames}] because they have active jobs`,
        );
      }

      const deletedCount = await this.repository.bulkDelete(ids);

      this.logger.log(`Bulk deleted ${deletedCount} server(s)`);

      return {
        deletedCount,
        deletedIds: ids.slice(0, deletedCount),
      };
    } catch (error) {
      this.logger.error('Error bulk deleting servers:', error);
      throw error;
    }
  }

  async incrementJobCount(serverId: string): Promise<Server> {
    try {
      const server = await this.repository.findById(serverId);
      if (!server) {
        throw new NotFoundException(`Server with ID ${serverId} not found`);
      }

      if (server.job_count >= 200) {
        throw new BadRequestException(
          `Server "${server.name}" is at maximum capacity (200 jobs)`,
        );
      }

      return await this.repository.incrementJobCount(serverId);
    } catch (error) {
      this.logger.error(`Error incrementing job count for server ${serverId}:`, error);
      throw error;
    }
  }

  async decrementJobCount(serverId: string): Promise<Server> {
    try {
      const server = await this.repository.findById(serverId);
      if (!server) {
        throw new NotFoundException(`Server with ID ${serverId} not found`);
      }

      if (server.job_count <= 0) {
        this.logger.warn(
          `Attempted to decrement job count for server "${server.name}" but count is already 0`,
        );
        return server;
      }

      return await this.repository.decrementJobCount(serverId);
    } catch (error) {
      this.logger.error(`Error decrementing job count for server ${serverId}:`, error);
      throw error;
    }
  }

  // ========== Date-Based Scheduling Methods ==========

  async findAvailableServerForDate(date: string): Promise<Server | null> {
    try {
      return await this.repository.findAvailableServerForDate(date);
    } catch (error) {
      this.logger.error(`Error finding available server for date ${date}:`, error);
      throw error;
    }
  }

  async assignServerForDate(scheduleDate: string): Promise<string | null> {
    try {
      const server = await this.repository.findAvailableServerForDate(scheduleDate);
      
      if (!server) {
        this.logger.warn(`No available server found for date ${scheduleDate}`);
        return null;
      }

      // Increment capacity for this date
      await this.repository.incrementDateCapacity(server.id, scheduleDate);
      
      this.logger.log(`Assigned server "${server.name}" (ID: ${server.id}) for date ${scheduleDate}`);
      
      return server.id;
    } catch (error) {
      this.logger.error(`Error assigning server for date ${scheduleDate}:`, error);
      throw error;
    }
  }

  async incrementDateCapacity(serverId: string, date: string): Promise<void> {
    try {
      const server = await this.repository.findById(serverId);
      if (!server) {
        throw new NotFoundException(`Server with ID ${serverId} not found`);
      }

      await this.repository.incrementDateCapacity(serverId, date);
      
      this.logger.log(`Incremented capacity for server "${server.name}" on date ${date}`);
    } catch (error) {
      this.logger.error(`Error incrementing date capacity:`, error);
      throw error;
    }
  }

  async decrementDateCapacity(serverId: string, date: string): Promise<void> {
    try {
      const server = await this.repository.findById(serverId);
      if (!server) {
        throw new NotFoundException(`Server with ID ${serverId} not found`);
      }

      await this.repository.decrementDateCapacity(serverId, date);
      
      this.logger.log(`Decremented capacity for server "${server.name}" on date ${date}`);
    } catch (error) {
      this.logger.error(`Error decrementing date capacity:`, error);
      throw error;
    }
  }

  async getServerScheduleForDate(serverId: string, date: string) {
    try {
      return await this.repository.getServerScheduleForDate(serverId, date);
    } catch (error) {
      this.logger.error(`Error getting server schedule for date:`, error);
      throw error;
    }
  }

  async getServerDailySchedules(serverId: string, filters?: {
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    try {
      return await this.repository.getServerDailySchedules(serverId, filters);
    } catch (error) {
      this.logger.error(`Error getting server daily schedules:`, error);
      throw error;
    }
  }

  async moveJobBetweenDates(serverId: string, oldDate: string, newDate: string): Promise<void> {
    try {
      await this.repository.moveJobBetweenDates(serverId, oldDate, newDate);
      
      this.logger.log(`Moved job between dates for server ${serverId}: ${oldDate} -> ${newDate}`);
    } catch (error) {
      this.logger.error(`Error moving job between dates:`, error);
      throw error;
    }
  }
}
