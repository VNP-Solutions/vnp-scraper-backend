import { Job } from '@prisma/client';
import { CreateJobDto, UpdateJobDto } from './job.dto';

export interface IJobRepository {
  create(data: CreateJobDto): Promise<Job>;
  findById(id: string): Promise<Job>;
  findAll(query: Record<string, any>): Promise<{ data: Job[]; metadata: any }>;
  update(id: string, data: UpdateJobDto): Promise<Job>;
  delete(id: string): Promise<Job>;
  findPortfolioByName(name: string): Promise<any>;
  findSubPortfolioByNameAndPortfolio(
    name: string,
    portfolioId: string,
  ): Promise<any>;
  findPropertyByNameAndRelations(
    name: string,
    portfolioId?: string,
    subPortfolioId?: string,
  ): Promise<any>;
}

export interface IJobService {
  createJob(data: CreateJobDto): Promise<Job>;
  getAllJobs(
    query: Record<string, any>,
  ): Promise<{ data: Job[]; metadata: any }>;
  getJobById(id: string): Promise<Job>;
  updateJob(id: string, data: UpdateJobDto): Promise<Job>;
  deleteJob(id: string): Promise<Job>;
  importJobsFromExcel(
    file: Express.Multer.File,
    userId: string,
  ): Promise<{
    jobsCreated: number;
    jobs: any[];
  }>;
}
