import { Job } from '@prisma/client';
import { CreateJobDto, UpdateJobDto } from './job.dto';

export interface IJobRepository {
  create(data: CreateJobDto): Promise<Job>;
  findById(id: string): Promise<Job>;
  findAll(query: Record<string, any>): Promise<{ data: Job[]; metadata: any }>;
  update(id: string, data: UpdateJobDto): Promise<Job>;
  delete(id: string): Promise<Job>;
}

export interface IJobService {
  createJob(data: CreateJobDto): Promise<Job>;
  getAllJobs(
    query: Record<string, any>,
  ): Promise<{ data: Job[]; metadata: any }>;
  getJobById(id: string): Promise<Job>;
  updateJob(id: string, data: UpdateJobDto): Promise<Job>;
  deleteJob(id: string): Promise<Job>;
}
