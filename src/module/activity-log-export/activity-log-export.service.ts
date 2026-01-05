import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  IActivityLogExportRepository,
  IActivityLogExportService,
} from './activity-log-export.interface';

@Injectable()
export class ActivityLogExportService implements IActivityLogExportService {
  constructor(
    @Inject('IActivityLogExportRepository')
    private readonly repository: IActivityLogExportRepository,
  ) {}

  async createExport(data: {
    fileName: string;
    s3Url: string;
    exportDate: Date;
  }) {
    return this.repository.create(data);
  }

  async getAllExports(page = 1, limit = 10, query?: Record<string, any>) {
    const queryParams = {
      page,
      limit,
      ...query,
    };
    return this.repository.findAll(queryParams);
  }

  async getExportById(id: string) {
    const exportRecord = await this.repository.findById(id);
    if (!exportRecord) {
      throw new NotFoundException(
        `Activity log export with ID ${id} not found`,
      );
    }
    return exportRecord;
  }

  async deleteExport(id: string) {
    await this.getExportById(id);
    return this.repository.delete(id);
  }
}
