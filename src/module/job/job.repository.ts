import { Injectable, Logger } from '@nestjs/common';
import { Job, Prisma } from '@prisma/client';
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
      const { portfolio_id, sub_portfolio_id, property_id, user_id, ...rest } =
        data;
      const jobData: Prisma.JobCreateInput = {
        ...rest,
        next_due_date: data.next_due_date || null,
        portfolio_name: data.portfolio_name || '',
        sub_portfolio_name: data.sub_portfolio_name || '',
        property_name: data.property_name,
        billing_type: data.billing_type || '',
        user: { connect: { id: user_id } },
        portfolio: portfolio_id ? { connect: { id: portfolio_id } } : undefined,
        subPortfolio: sub_portfolio_id
          ? { connect: { id: sub_portfolio_id } }
          : undefined,
        property: property_id ? { connect: { id: property_id } } : undefined,
      };
      const job = await this.db.job.create({
        data: jobData,
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
        page,
        limit,
        sortBy,
        sortOrder,
        search,
        start_date,
        end_date,
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
      const skip = page
        ? (parseInt(page || '1') - 1) * parseInt(limit || '10')
        : 0;
      const take = limit ? parseInt(limit) : 10;
      let orderBy = undefined;
      if (sortBy) {
        orderBy = {
          [sortBy]: sortOrder?.toLowerCase() === 'desc' ? 'desc' : 'asc',
        };
      }
      const totalDocuments = await this.db.job.count({ where: allFilters });
      const jobs = await this.db.job.findMany({
        where: allFilters,
        skip,
        take,
        orderBy,
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
