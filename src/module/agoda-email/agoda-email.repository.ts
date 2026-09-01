import { Injectable, Logger } from '@nestjs/common';
import { AgodaEmail, Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { CreateAgodaEmailDto, UpdateAgodaEmailDto } from './agoda-email.dto';
import {
  AgodaEmailFilters,
  IAgodaEmailRepository,
  PaginatedAgodaEmails,
} from './agoda-email.interface';

@Injectable()
export class AgodaEmailRepository implements IAgodaEmailRepository {
  private readonly logger = new Logger(AgodaEmailRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async create(data: CreateAgodaEmailDto): Promise<AgodaEmail> {
    try {
      const { job_id, screenshots, ...rest } = data;

      return await this.db.agodaEmail.create({
        data: {
          ...rest,
          screenshots: screenshots ?? [],
          job: { connect: { id: job_id } },
        },
      });
    } catch (error) {
      this.logger.error('Error creating agoda email:', error);
      throw error;
    }
  }

  async findAll(filters?: AgodaEmailFilters): Promise<PaginatedAgodaEmails> {
    try {
      const page = filters?.page || 1;
      const limit = filters?.limit || 10;
      const skip = (page - 1) * limit;
      const order = filters?.order || 'desc';

      const where: Prisma.AgodaEmailWhereInput = {};

      if (filters?.job_id) {
        where.job_id = filters.job_id;
      }

      if (filters?.date) {
        where.date = filters.date;
      }

      if (filters?.search) {
        const searchTerm = filters.search.toString().trim();
        const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchTerm);

        where.OR = [
          ...(isValidObjectId ? [{ id: searchTerm }] : []),
          { email_id: { contains: searchTerm, mode: 'insensitive' as const } },
          { subject: { contains: searchTerm, mode: 'insensitive' as const } },
          { from: { contains: searchTerm, mode: 'insensitive' as const } },
          { to: { contains: searchTerm, mode: 'insensitive' as const } },
        ];
      }

      const [items, totalDocuments] = await Promise.all([
        this.db.agodaEmail.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: order },
        }),
        this.db.agodaEmail.count({ where }),
      ]);

      return {
        items,
        totalDocuments,
        currentPage: page,
        totalPage: Math.ceil(totalDocuments / limit),
        limit,
      };
    } catch (error) {
      this.logger.error('Error finding agoda emails:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<AgodaEmail | null> {
    try {
      return await this.db.agodaEmail.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Error finding agoda email by id ${id}:`, error);
      throw error;
    }
  }

  async findByJobId(jobId: string): Promise<AgodaEmail[]> {
    try {
      return await this.db.agodaEmail.findMany({
        where: { job_id: jobId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(`Error finding agoda emails for job ${jobId}:`, error);
      throw error;
    }
  }

  async update(id: string, data: UpdateAgodaEmailDto): Promise<AgodaEmail> {
    try {
      const { job_id, ...rest } = data;

      return await this.db.agodaEmail.update({
        where: { id },
        data: {
          ...rest,
          ...(job_id ? { job: { connect: { id: job_id } } } : {}),
        },
      });
    } catch (error) {
      this.logger.error(`Error updating agoda email ${id}:`, error);
      throw error;
    }
  }

  async delete(id: string): Promise<AgodaEmail> {
    try {
      return await this.db.agodaEmail.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Error deleting agoda email ${id}:`, error);
      throw error;
    }
  }

  async jobExists(jobId: string): Promise<boolean> {
    try {
      const job = await this.db.job.findUnique({
        where: { id: jobId },
        select: { id: true },
      });
      return !!job;
    } catch (error) {
      this.logger.error(`Error checking job ${jobId}:`, error);
      throw error;
    }
  }
}
