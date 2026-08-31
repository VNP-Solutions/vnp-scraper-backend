import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AgodaEmail } from '@prisma/client';
import { CreateAgodaEmailDto, UpdateAgodaEmailDto } from './agoda-email.dto';
import {
  AgodaEmailFilters,
  IAgodaEmailRepository,
  IAgodaEmailService,
  PaginatedAgodaEmails,
} from './agoda-email.interface';

@Injectable()
export class AgodaEmailService implements IAgodaEmailService {
  private readonly logger = new Logger(AgodaEmailService.name);

  constructor(
    @Inject('IAgodaEmailRepository')
    private readonly repository: IAgodaEmailRepository,
  ) {}

  /**
   * Guards the job relation before writing. Prisma would reject an unknown
   * job_id anyway, but a P2025 surfaces as a 500 — checking here turns it
   * into the 404 the API contract promises.
   */
  private async assertJobExists(jobId: string): Promise<void> {
    const exists = await this.repository.jobExists(jobId);
    if (!exists) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }
  }

  async create(data: CreateAgodaEmailDto): Promise<AgodaEmail> {
    try {
      await this.assertJobExists(data.job_id);

      const item = await this.repository.create(data);
      this.logger.log(`Agoda email created (ID: ${item.id})`);
      return item;
    } catch (error) {
      this.logger.error('Error creating agoda email:', error);
      throw error;
    }
  }

  async findAll(filters?: AgodaEmailFilters): Promise<PaginatedAgodaEmails> {
    try {
      return await this.repository.findAll(filters);
    } catch (error) {
      this.logger.error('Error finding agoda emails:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<AgodaEmail> {
    try {
      const item = await this.repository.findById(id);
      if (!item) {
        throw new NotFoundException(`Agoda email with ID ${id} not found`);
      }
      return item;
    } catch (error) {
      this.logger.error(`Error finding agoda email by ID ${id}:`, error);
      throw error;
    }
  }

  async findByJobId(jobId: string): Promise<AgodaEmail[]> {
    try {
      return await this.repository.findByJobId(jobId);
    } catch (error) {
      this.logger.error(`Error finding agoda emails for job ${jobId}:`, error);
      throw error;
    }
  }

  async update(id: string, data: UpdateAgodaEmailDto): Promise<AgodaEmail> {
    try {
      const existing = await this.repository.findById(id);
      if (!existing) {
        throw new NotFoundException(`Agoda email with ID ${id} not found`);
      }

      if (data.job_id && data.job_id !== existing.job_id) {
        await this.assertJobExists(data.job_id);
      }

      const updated = await this.repository.update(id, data);
      this.logger.log(`Agoda email updated (ID: ${id})`);
      return updated;
    } catch (error) {
      this.logger.error(`Error updating agoda email ${id}:`, error);
      throw error;
    }
  }

  async delete(
    id: string,
  ): Promise<{ deletedCount: number; deletedId: string }> {
    try {
      const item = await this.repository.findById(id);
      if (!item) {
        throw new NotFoundException(`Agoda email with ID ${id} not found`);
      }

      await this.repository.delete(id);
      this.logger.log(`Agoda email deleted (ID: ${id})`);

      return {
        deletedCount: 1,
        deletedId: id,
      };
    } catch (error) {
      this.logger.error(`Error deleting agoda email ${id}:`, error);
      throw error;
    }
  }
}
