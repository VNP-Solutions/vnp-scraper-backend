import {
  AgodaCaseItem,
  Batch,
  Portfolio,
  PostingType,
  Property,
  PropertyCredentials,
  User,
} from '@prisma/client';
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
  posting_type?: PostingType;
  /** Filter by the user who created the item (`createdBy` on the model). */
  createdBy?: string;
  is_archived?: boolean;
  is_declined?: boolean;
  /**
   * Restrict to exactly these AgodaCaseItem ids — how "export selected
   * rows" works: the frontend sends the checked ids here instead of (or on
   * top of) the other filters.
   */
  ids?: string[];
  page?: number;
  limit?: number;
  order?: 'asc' | 'desc';
}

/** One row of the WIP export, with just enough of each relation resolved. */
export type AgodaCaseItemForExport = AgodaCaseItem & {
  property: (Property & { credentials: PropertyCredentials[] }) | null;
  batch: Batch | null;
  portfolio: Portfolio | null;
  creator: User | null;
};

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

  /**
   * Every matching row (no pagination), with property/batch/portfolio/
   * creator resolved, for the WIP xlsx export.
   */
  findAllForExport(
    filters?: AgodaCaseItemFilters,
  ): Promise<AgodaCaseItemForExport[]>;

  findById(id: string): Promise<AgodaCaseItem | null>;

  update(id: string, data: UpdateAgodaCaseItemDto): Promise<AgodaCaseItem>;

  delete(id: string): Promise<AgodaCaseItem>;

  /** Sets is_archived: true on every given id. Returns how many rows matched. */
  archiveByIds(ids: string[]): Promise<number>;

  /** Sets charge_status: 'declined' and is_declined: true on every given id. Returns how many rows matched. */
  declineByIds(ids: string[]): Promise<number>;

  /** Bulk create multiple AgodaCaseItems. Returns array of created items. */
  bulkCreate(data: CreateAgodaCaseItemDto[]): Promise<AgodaCaseItem[]>;

  /** Find property by agoda_id */
  findPropertyByAgodaId(agodaId: string): Promise<{ id: string } | null>;

  /** Find batch by name */
  findBatchByName(batchName: string): Promise<{ id: string } | null>;

  /** Find portfolio by name */
  findPortfolioByName(portfolioName: string): Promise<{ id: string } | null>;

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

  /** Builds the WIP xlsx export for the given filters (same filters as findAll, minus pagination). */
  exportWip(
    filters?: AgodaCaseItemFilters,
  ): Promise<{ buffer: Buffer; fileName: string }>;

  /**
   * Same export as exportWip, but every row that ends up in the file also
   * gets is_archived set to true — for "export and archive" in one step.
   */
  exportWipAndArchive(
    filters?: AgodaCaseItemFilters,
  ): Promise<{ buffer: Buffer; fileName: string; archivedCount: number }>;

  /**
   * Marks multiple items as declined by setting charge_status to 'declined'
   * and is_declined to true.
   */
  bulkDecline(ids: string[]): Promise<number>;

  /**
   * Import AgodaCaseItems from Excel file for declined items.
   * @param file - Excel file buffer
   * @param archive - Whether to set is_archived to true
   */
  importWipDeclined(
    file: Express.Multer.File,
    archive: boolean,
  ): Promise<{
    successCount: number;
    failedCount: number;
    totalRows: number;
    errors: string[];
  }>;
}
