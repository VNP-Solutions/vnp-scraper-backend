import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DbData, DbEntry } from '@prisma/client';
import { IDbDataRepository, IDbDataService } from './db-data.interface';

@Injectable()
export class DbDataService implements IDbDataService {
  constructor(
    @Inject('IDbDataRepository')
    private readonly repository: IDbDataRepository,
    private readonly logger: Logger,
  ) {}

  async getAllDbData(
    query?: Record<string, any>,
  ): Promise<{ data: DbData[]; metadata: any }> {
    try {
      const result = await this.repository.findAll(query);
      return result;
    } catch (error) {
      this.logger.error(
        `Error getting all DbData: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAllDbDataByJobId(jobId: string): Promise<DbData[]> {
    try {
      const dbData = await this.repository.findAllByJobId(jobId);
      return dbData;
    } catch (error) {
      this.logger.error(
        `Error getting DbData by job ID: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getDbDataById(id: string): Promise<DbData | null> {
    try {
      const dbData = await this.repository.findById(id);
      if (!dbData) {
        throw new NotFoundException(`DbData with ID ${id} not found`);
      }
      return dbData;
    } catch (error) {
      this.logger.error(
        `Error getting DbData by ID: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async deleteDbData(id: string): Promise<void> {
    try {
      const dbData = await this.repository.findById(id);
      if (!dbData) {
        throw new NotFoundException(`DbData with ID ${id} not found`);
      }
      await this.repository.delete(id);
    } catch (error) {
      this.logger.error(`Error deleting DbData: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getDbEntriesByDbDataId(dbDataId: string): Promise<DbEntry[]> {
    try {
      const dbEntries = await this.repository.findDbEntriesByDbDataId(dbDataId);
      return dbEntries;
    } catch (error) {
      this.logger.error(
        `Error getting DbEntry by db_data_id: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
