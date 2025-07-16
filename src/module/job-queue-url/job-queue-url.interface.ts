import { JobQueueUrl, JobQueueUrlStatus } from '@prisma/client';

export interface IJobQueueUrl extends JobQueueUrl {}

export interface IJobQueueUrlRepository {
  create(data: CreateJobQueueUrlData): Promise<IJobQueueUrl>;
  findById(id: string): Promise<IJobQueueUrl | null>;
  findAll(): Promise<IJobQueueUrl[]>;
  findAvailableUrls(): Promise<IJobQueueUrl[]>;
  update(id: string, data: UpdateJobQueueUrlData): Promise<IJobQueueUrl>;
  delete(id: string): Promise<void>;
  findByUrl(url: string): Promise<IJobQueueUrl | null>;
  findAvailableUrlForBooking(): Promise<IJobQueueUrl | null>;
  bookUrl(id: string, jobId: string): Promise<IJobQueueUrl>;
  releaseUrl(id: string): Promise<IJobQueueUrl>;
  findByStatus(status: JobQueueUrlStatus): Promise<IJobQueueUrl[]>;
}

export interface IJobQueueUrlService {
  createUrl(data: CreateJobQueueUrlData): Promise<IJobQueueUrl>;
  getUrlById(id: string): Promise<IJobQueueUrl>;
  getAllUrls(): Promise<IJobQueueUrl[]>;
  updateUrl(id: string, data: UpdateJobQueueUrlData): Promise<IJobQueueUrl>;
  deleteUrl(id: string): Promise<void>;
  getAvailableUrls(): Promise<IJobQueueUrl[]>;
  bookAvailableUrl(jobId: string): Promise<{
    success: boolean;
    url?: IJobQueueUrl;
    message: string;
  }>;
  releaseUrl(urlId: string): Promise<IJobQueueUrl>;
  getUrlsByStatus(status: JobQueueUrlStatus): Promise<IJobQueueUrl[]>;
  getQueueStatistics(): Promise<{
    total: number;
    available: number;
    booked: number;
    maintenance: number;
    offline: number;
    totalCapacity: number;
    currentUsage: number;
  }>;
  setUrlMaintenance(id: string): Promise<IJobQueueUrl>;
  setUrlOffline(id: string): Promise<IJobQueueUrl>;
  setUrlOnline(id: string): Promise<IJobQueueUrl>;
}

export interface CreateJobQueueUrlData {
  name: string;
  url: string;
  description?: string;
  priority?: number;
  max_concurrent_jobs?: number;
  is_active?: boolean;
}

export interface UpdateJobQueueUrlData {
  name?: string;
  url?: string;
  status?: JobQueueUrlStatus;
  description?: string;
  priority?: number;
  max_concurrent_jobs?: number;
  is_active?: boolean;
}
