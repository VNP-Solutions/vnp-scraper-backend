import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ActivityLogService {
  constructor(private db: DatabaseService) {}

  async getUserDetails(userId: string) {
    return this.db.user.findUnique({
      where: { id: userId },
      select: { name: true, role: true },
    });
  }

  async logActivity(data: {
    username: string;
    role: string;
    endpoint: string;
    success: boolean;
    statusCode: number;
    ipAddress: string;
    resource: string;
    responseTime: number;
  }) {
    try {
      await this.db.activityLog.create({
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
      console.error('Failed to log activity:', error);
    }
  }

  async getAllLogs(page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.db.activityLog.findMany({
        skip,
        take: limit,
        orderBy: {
          timestamp: 'desc',
        },
      }),
      this.db.activityLog.count(),
    ]);

    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async deleteLog(id: string) {
    return this.db.activityLog.delete({
      where: { id },
    });
  }

  async deleteAllLogs() {
    return this.db.activityLog.deleteMany({});
  }
}
