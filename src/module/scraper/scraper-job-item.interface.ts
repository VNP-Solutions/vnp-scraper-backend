import { JobItem } from '@prisma/client';

export interface IScraperJobItemRepository {
  findAllByJobId(jobId: string): Promise<JobItem[]>;
  findAllByJobIdWithPagination(
    jobId: string,
    query?: Record<string, any>,
  ): Promise<{ data: JobItem[]; metadata: any }>;
}

export interface IScraperJobItemService {
  getAllJobItemsByJobId(jobId: string): Promise<JobItem[]>;
  getJobItemsByJobIdWithPagination(
    jobId: string,
    query?: Record<string, any>,
  ): Promise<{ data: JobItem[]; metadata: any }>;
}
