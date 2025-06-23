import { JobItem } from '@prisma/client';

export interface IScraperJobItemRepository {
  findAllByJobId(jobId: string): Promise<JobItem[]>;
}

export interface IScraperJobItemService {
  getAllJobItemsByJobId(jobId: string): Promise<JobItem[]>;
}
