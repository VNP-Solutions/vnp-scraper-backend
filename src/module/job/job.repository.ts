import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { CreateJobDto, UpdateJobDto } from './job.dto';
import { IJobRepository } from './job.interface';

@Injectable()
export class JobRepository implements IJobRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  async create(data: CreateJobDto): Promise<Job> {
    try {
      const job = await this.db.job.create({
        data,
      });
      return job;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findById(id: string): Promise<Job> {
    try {
      const job = await this.db.job.findUnique({
        where: { id },
      });
      return job;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findAll(
    query: Record<string, any>,
  ): Promise<{ data: Job[]; metadata: any }> {
    try {
      const {
        search,
        start_date,
        end_date,
        page = 1,
        limit = 10,
        ...filters
      } = query || {};
      let allFilters: any = { ...filters };
      if (search) {
        allFilters.OR = [
          { portfolio_name: { contains: search, mode: 'insensitive' } },
          { sub_portfolio_name: { contains: search, mode: 'insensitive' } },
          { property_name: { contains: search, mode: 'insensitive' } },
        ];
      }
      if (start_date && end_date) {
        allFilters.createdAt = {
          gte: new Date(start_date),
          lte: new Date(end_date),
        };
      }
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const totalDocuments = await this.db.job.count({ where: allFilters });
      const jobs = await this.db.job.findMany({
        where: allFilters,
        skip,
        take: parseInt(limit),
      });
      const metadata = {
        totalDocuments,
        currentPage: parseInt(page),
        totalPage: Math.ceil(totalDocuments / parseInt(limit)),
        limit: parseInt(limit),
      };
      return { data: jobs, metadata };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async update(id: string, data: UpdateJobDto): Promise<Job> {
    try {
      const job = await this.db.job.update({
        where: { id },
        data,
      });
      return job;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async delete(id: string): Promise<Job> {
    try {
      const job = await this.db.job.delete({
        where: { id },
      });
      return job;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
}
