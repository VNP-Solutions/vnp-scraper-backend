import { OtpPlatform, Server } from '@prisma/client';

export interface IServerRepository {
  create(data: {
    name: string;
    url: string;
    platform?: OtpPlatform;
    is_active?: boolean;
  }): Promise<Server>;

  findAll(filters?: {
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
  }>;

  findById(id: string): Promise<Server | null>;

  findByName(name: string): Promise<Server | null>;

  findAvailableServer(): Promise<Server | null>;

  findAvailableServerByPlatform(platform: OtpPlatform): Promise<Server | null>;

  update(
    id: string,
    data: {
      name?: string;
      url?: string;
      platform?: OtpPlatform;
      is_active?: boolean;
    },
  ): Promise<Server>;

  delete(id: string): Promise<Server>;

  incrementJobCount(id: string): Promise<Server>;

  decrementJobCount(id: string): Promise<Server>;

  bulkDelete(ids: string[]): Promise<number>;

  // Date-based scheduling methods
  findAvailableServerForDate(date: string): Promise<Server | null>;
  
  incrementDateCapacity(serverId: string, date: string): Promise<void>;
  
  decrementDateCapacity(serverId: string, date: string): Promise<void>;
  
  getServerScheduleForDate(serverId: string, date: string): Promise<{
    server: Server;
    assignedJobs: number;
    availableCapacity: number;
  } | null>;
  
  getServerDailySchedules(serverId: string, filters?: {
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    schedules: any[];
    totalDocuments: number;
    currentPage: number;
    totalPage: number;
    limit: number;
  }>;
  
  moveJobBetweenDates(serverId: string, oldDate: string, newDate: string): Promise<void>;
}

export interface IServerService {
  createServer(data: {
    name: string;
    url: string;
    platform?: OtpPlatform;
    is_active?: boolean;
  }): Promise<Server>;

  findAllServers(filters?: {
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
  }>;

  findServerById(id: string): Promise<Server>;

  findAvailableServer(): Promise<Server | null>;

  findAvailableServerByPlatform(platform: OtpPlatform): Promise<Server | null>;

  updateServer(
    id: string,
    data: {
      name?: string;
      url?: string;
      platform?: OtpPlatform;
      is_active?: boolean;
    },
  ): Promise<Server>;

  deleteServer(id: string): Promise<{ deletedCount: number; deletedId: string }>;

  bulkDeleteServers(ids: string[]): Promise<{
    deletedCount: number;
    deletedIds: string[];
  }>;

  incrementJobCount(serverId: string): Promise<Server>;

  decrementJobCount(serverId: string): Promise<Server>;

  // Date-based scheduling methods
  findAvailableServerForDate(date: string): Promise<Server | null>;
  
  assignServerForDate(scheduleDate: string): Promise<string | null>;
  
  incrementDateCapacity(serverId: string, date: string): Promise<void>;
  
  decrementDateCapacity(serverId: string, date: string): Promise<void>;
  
  getServerScheduleForDate(serverId: string, date: string): Promise<{
    server: Server;
    assignedJobs: number;
    availableCapacity: number;
  } | null>;
  
  getServerDailySchedules(serverId: string, filters?: {
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    schedules: any[];
    totalDocuments: number;
    currentPage: number;
    totalPage: number;
    limit: number;
  }>;
  
  moveJobBetweenDates(serverId: string, oldDate: string, newDate: string): Promise<void>;
}
