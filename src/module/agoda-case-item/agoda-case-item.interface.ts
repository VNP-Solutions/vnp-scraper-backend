import { AgodaCaseItem, OTAProvider } from '@prisma/client';
import {
  CreateAgodaCaseItemDto,
  UpdateAgodaCaseItemDto,
} from './agoda-case-item.dto';

export interface AgodaCaseItemFilters {
  search?: string;
  property_id?: string;
  batch_id?: string;
  portfolio_id?: string;
  retrival_status?: string;
  charge_status?: string;
  is_missing?: boolean;
  ota_provider?: OTAProvider;
  /** Filter by the user who created the item (`createdBy` on the model). */
  createdBy?: string;
  is_archived?: boolean;
  is_declined?: boolean;
  page?: number;
  limit?: number;
  order?: 'asc' | 'desc';
}

export interface PaginatedAgodaCaseItems {
  items: AgodaCaseItem[];
  totalDocuments: number;
  currentPage: number;
  totalPage: number;
  limit: number;
}

export interface IAgodaCaseItemRepository {
  create(data: CreateAgodaCaseItemDto): Promise<AgodaCaseItem>;

  findAll(filters?: AgodaCaseItemFilters): Promise<PaginatedAgodaCaseItems>;

  findById(id: string): Promise<AgodaCaseItem | null>;

  update(id: string, data: UpdateAgodaCaseItemDto): Promise<AgodaCaseItem>;

  delete(id: string): Promise<AgodaCaseItem>;

  propertyExists(propertyId: string): Promise<boolean>;

  batchExists(batchId: string): Promise<boolean>;

  portfolioExists(portfolioId: string): Promise<boolean>;

  userExists(userId: string): Promise<boolean>;
}

export interface IAgodaCaseItemService {
  create(data: CreateAgodaCaseItemDto): Promise<AgodaCaseItem>;

  findAll(filters?: AgodaCaseItemFilters): Promise<PaginatedAgodaCaseItems>;

  findById(id: string): Promise<AgodaCaseItem>;

  update(id: string, data: UpdateAgodaCaseItemDto): Promise<AgodaCaseItem>;

  delete(id: string): Promise<{ deletedCount: number; deletedId: string }>;
}
