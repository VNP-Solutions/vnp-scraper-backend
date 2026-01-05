import { ActivityLogExport } from '@prisma/client';

export interface IActivityLogExportRepository {
  create(data: {
    fileName: string;
    s3Url: string;
    exportDate: Date;
  }): Promise<ActivityLogExport>;

  findAll(query?: Record<string, any>): Promise<{
    data: ActivityLogExport[];
    metadata: any;
  }>;

  findById(id: string): Promise<ActivityLogExport | null>;

  delete(id: string): Promise<ActivityLogExport>;
}

export interface IActivityLogExportService {
  createExport(data: {
    fileName: string;
    s3Url: string;
    exportDate: Date;
  }): Promise<ActivityLogExport>;

  getAllExports(
    page?: number,
    limit?: number,
    query?: Record<string, any>,
  ): Promise<{ data: ActivityLogExport[]; metadata: any }>;

  getExportById(id: string): Promise<ActivityLogExport>;

  deleteExport(id: string): Promise<ActivityLogExport>;
}
