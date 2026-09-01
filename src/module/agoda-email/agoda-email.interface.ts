import { AgodaEmail } from '@prisma/client';
import { CreateAgodaEmailDto, UpdateAgodaEmailDto } from './agoda-email.dto';

export interface AgodaEmailFilters {
  search?: string;
  job_id?: string;
  date?: string;
  page?: number;
  limit?: number;
  order?: 'asc' | 'desc';
}

export interface PaginatedAgodaEmails {
  items: AgodaEmail[];
  totalDocuments: number;
  currentPage: number;
  totalPage: number;
  limit: number;
}

export interface IAgodaEmailRepository {
  create(data: CreateAgodaEmailDto): Promise<AgodaEmail>;

  findAll(filters?: AgodaEmailFilters): Promise<PaginatedAgodaEmails>;

  findById(id: string): Promise<AgodaEmail | null>;

  findByJobId(jobId: string): Promise<AgodaEmail[]>;

  update(id: string, data: UpdateAgodaEmailDto): Promise<AgodaEmail>;

  delete(id: string): Promise<AgodaEmail>;

  jobExists(jobId: string): Promise<boolean>;
}

export interface IAgodaEmailService {
  create(data: CreateAgodaEmailDto): Promise<AgodaEmail>;

  findAll(filters?: AgodaEmailFilters): Promise<PaginatedAgodaEmails>;

  findById(id: string): Promise<AgodaEmail>;

  findByJobId(jobId: string): Promise<AgodaEmail[]>;

  update(id: string, data: UpdateAgodaEmailDto): Promise<AgodaEmail>;

  delete(id: string): Promise<{ deletedCount: number; deletedId: string }>;
}
