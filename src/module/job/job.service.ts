import { Inject, Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { CreateJobDto, UpdateJobDto } from './job.dto';
import { IJobRepository, IJobService } from './job.interface';

@Injectable()
export class JobService implements IJobService {
  constructor(
    @Inject('IJobRepository')
    private readonly repository: IJobRepository,
    private readonly logger: Logger,
  ) {}

  async createJob(data: CreateJobDto): Promise<Job> {
    try {
      const job = await this.repository.create(data);
      return job;
    } catch (error) {
      this.logger.error(`Error creating job: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getAllJobs(query?: string): Promise<Job[]> {
    try {
      const jobs = await this.repository.findAll(query);
      return jobs;
    } catch (error) {
      this.logger.error(`Error getting jobs: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getJobById(id: string): Promise<Job> {
    try {
      const job = await this.repository.findById(id);
      if (!job) {
        throw new Error(`Job with ID ${id} not found`);
      }
      return job;
    } catch (error) {
      this.logger.error(`Error finding job: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateJob(id: string, data: UpdateJobDto): Promise<Job> {
    try {
      const job = await this.repository.update(id, data);
      return job;
    } catch (error) {
      this.logger.error(`Error updating job: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteJob(id: string): Promise<Job> {
    try {
      const job = await this.repository.delete(id);
      return job;
    } catch (error) {
      this.logger.error(`Error deleting job: ${error.message}`, error.stack);
      throw error;
    }
  }
}