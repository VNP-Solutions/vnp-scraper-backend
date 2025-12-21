import { Injectable, Logger } from '@nestjs/common';
import { DbData, DbEntry } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { IDbDataRepository } from './db-data.interface';

@Injectable()
export class DbDataRepository implements IDbDataRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  async findAll(
    query?: Record<string, any>,
  ): Promise<{ data: DbData[]; metadata: any }> {
    try {
      const {
        page,
        limit,
        sortBy,
        sortOrder,
        search,
        start_date,
        end_date,
        job_id,
        property_id,
        property_name,
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
          created_at: 'desc',
        };
      }

      let allFilters: any = { ...filters };

      // Build additional conditions array
      const additionalConditions = [];

      if (search) {
        additionalConditions.push({
          OR: [
            {
              property_name: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              property_id: {
                contains: search,
                mode: 'insensitive',
              },
            },
          ],
        });
      }

      if (start_date && end_date) {
        additionalConditions.push({
          created_at: {
            gte: new Date(start_date),
            lte: new Date(end_date),
          },
        });
      }

      if (job_id) {
        additionalConditions.push({
          job_id: job_id,
        });
      }

      if (property_id) {
        additionalConditions.push({
          property_id: property_id,
        });
      }

      if (property_name) {
        additionalConditions.push({
          property_name: {
            contains: property_name,
            mode: 'insensitive',
          },
        });
      }

      // Combine base filters with additional conditions
      if (additionalConditions.length > 0) {
        allFilters = {
          ...allFilters,
          AND: additionalConditions,
        };
      }

      const [dbData, totalDocuments] = await Promise.all([
        this.db.dbData.findMany({
          where: allFilters,
          skip,
          take,
          orderBy,
          include: {
            job: {
              select: {
                id: true,
                name: true,
                property_name: true,
                job_status: true,
              },
            },
          },
        }),
        this.db.dbData.count({
          where: allFilters,
        }),
      ]);

      const totalPage = Math.ceil(totalDocuments / take);
      const currentPage = page ? parseInt(page) : 1;

      return {
        data: dbData,
        metadata: {
          totalDocuments,
          totalPage,
          currentPage,
          limit: take,
          hasNextPage: currentPage < totalPage,
          hasPreviousPage: currentPage > 1,
        },
      };
    } catch (error) {
      this.logger.error(`Error finding DbData: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findAllByJobId(jobId: string): Promise<DbData[]> {
    try {
      const dbData = await this.db.dbData.findMany({
        where: { job_id: jobId },
        include: {
          job: {
            select: {
              id: true,
              name: true,
              property_name: true,
              job_status: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });
      return dbData;
    } catch (error) {
      this.logger.error(
        `Error finding DbData by job ID: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findById(id: string): Promise<DbData | null> {
    try {
      const dbData = await this.db.dbData.findUnique({
        where: { id },
        include: {
          job: {
            select: {
              id: true,
              name: true,
              property_name: true,
              job_status: true,
            },
          },
        },
      });
      return dbData;
    } catch (error) {
      this.logger.error(
        `Error finding DbData by ID: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  async delete(id: string): Promise<DbData | null> {
    try {
      const dbData = await this.db.dbData.delete({
        where: { id },
      });
      return dbData;
    } catch (error) {
      this.logger.error(`Error deleting DbData: ${error.message}`, error.stack);
      return null;
    }
  }

  async findDbEntriesByDbDataId(dbDataId: string): Promise<DbEntry[]> {
    try {
      const dbEntries = await this.db.dbEntry.findMany({
        where: { db_data_id: dbDataId },
        include: {
          dbData: {
            select: {
              id: true,
              property_name: true,
              property_id: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });
      return dbEntries;
    } catch (error) {
      this.logger.error(
        `Error finding DbEntry by db_data_id: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
