import { ActivityLog } from '@prisma/client';

export interface IActivityLogRepository {
  create(data: {
    username: string;
    role: string;
    endpoint: string;
    success: boolean;
    statusCode: number;
    ipAddress: string;
    resource: string;
    responseTime: number;
  }): Promise<ActivityLog>;

  findAll(
    query?: Record<string, any>,
  ): Promise<{ data: ActivityLog[]; metadata: any }>;

  delete(id: string): Promise<ActivityLog>;

  deleteMany(): Promise<{ count: number }>;

  getUserDetails(
    userId: string,
  ): Promise<{ name: string; role: string } | null>;
}

export interface IActivityLogService {
  getAllLogs(
    page?: number,
    limit?: number,
    query?: Record<string, any>,
  ): Promise<{ data: ActivityLog[]; metadata: any }>;
  deleteLog(id: string): Promise<ActivityLog>;
  deleteAllLogs(): Promise<{ count: number }>;
  logActivity(data: {
    username: string;
    role: string;
    endpoint: string;
    success: boolean;
    statusCode: number;
    ipAddress: string;
    resource: string;
    responseTime: number;
  }): Promise<void>;
  getUserDetails(
    userId: string,
  ): Promise<{ name: string; role: string } | null>;
}
