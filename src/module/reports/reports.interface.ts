import { JobStatus, OTAProvider } from '@prisma/client';
import type {
  ExportReportsMasterType,
  SearchReportsType,
} from './reports.validation';

/** Per-user permission scope. `null` means "no restriction" (admin). */
export type ReportsAccessScope =
  | null
  | {
      propertyIds: string[];
      portfolioIds: string[];
      subPortfolioIds: string[];
    };

/**
 * Filter the repository layer applies against either the Job or the
 * Retrieval collection. Built once in the service so both collections
 * see the exact same shape and the service layer keeps DB knowledge
 * out of the controller.
 */
export interface ReportsRepositoryFilter {
  /**
   * If non-null, restricts results to rows where property_id is in this
   * list. When the list is empty the calling service has already
   * determined no rows can match and skips the query.
   */
  propertyIdScope: string[] | null;

  /**
   * Optional portfolio scope. When set, rows must match
   * (portfolio_id IN portfolioIds OR sub_portfolio_id IN subPortfolioIds).
   * Used to support "portfolio" mode and the user permission filter.
   */
  portfolioScope: {
    portfolioIds: string[];
    subPortfolioIds: string[];
  } | null;

  otaProviders: OTAProvider[];
  jobStatuses: JobStatus[];
  executionTypes: string[];
  batchIds: string[];

  runWithin: { from?: Date; to?: Date } | null;
  startDate: { from?: Date; to?: Date } | null;
  endDate: { from?: Date; to?: Date } | null;

  includeArchived: boolean;

  /**
   * Job-only. When undefined, no card-period filter is applied. When set,
   * only Jobs whose `tags` array contains an `over_160` entry with this
   * boolean value are returned. (Selecting both Over160 and Under160 on
   * the request is normalized to undefined.)
   */
  cardOver160?: boolean;

  /** When 'DB'/'VCC' restrict Job.billing_type; ignored for retrievals. */
  billingTypes: string[];
}

/**
 * Normalized row shape returned to the controller. Both Jobs and
 * Retrievals are mapped to this shape before being merged + paginated.
 */
export interface ReportsResultItem {
  source: 'job' | 'retrieval';
  id: string;
  name: string | null;
  job_status: JobStatus;
  ota_provider: OTAProvider;
  billing_type: string | null;
  execution_type: string | null;
  portfolio_id: string | null;
  portfolio_name: string | null;
  sub_portfolio_id: string | null;
  sub_portfolio_name: string | null;
  property_id: string | null;
  property_name: string;
  batch_id: string | null;
  batch_name: string | null;
  start_date: string | null;
  end_date: string | null;
  is_archived: boolean;
  property: {
    id: string;
    name: string;
    expedia_id: number | null;
    booking_id: number | null;
    agoda_id: number | null;
  } | null;
  failed_reason: string;
  screenshot_urls: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportsSearchMetadata {
  totalDocuments: number;
  totalJobs: number;
  totalRetrievals: number;
  currentPage: number;
  totalPage: number;
  limit: number;
}

export interface ReportsSearchResult {
  data: ReportsResultItem[];
  metadata: ReportsSearchMetadata;
}

/**
 * Lightweight ID-only row that mirrors what the post-filter step needs:
 * the id, plus start_date / end_date (only relevant when job_dates is
 * present in the filter and we have to drop rows whose MM/DD/YYYY interval
 * doesn't overlap the requested window).
 */
export interface ReportsIdRow {
  id: string;
  start_date?: string | null;
  end_date?: string | null;
}

export interface ReportsIdsSearchMetadata {
  totalDocuments: number;
  totalJobs: number;
  totalRetrievals: number;
}

export interface ReportsIdsSearchResult {
  job_ids: string[];
  retrieval_ids: string[];
  metadata: ReportsIdsSearchMetadata;
}

export interface IReportsRepository {
  /** Compute the property / portfolio / sub-portfolio IDs a non-admin user can see. */
  getAccessScopeForUser(userId: string): Promise<{
    propertyIds: string[];
    portfolioIds: string[];
    subPortfolioIds: string[];
  }>;

  /** Sub-portfolio IDs that belong to the given portfolio. */
  getSubPortfolioIdsForPortfolio(portfolioId: string): Promise<string[]>;

  /**
   * Resolve a property text-search + explicit selection into a final list
   * of property IDs. Returns:
   *   - null when there is no property-level constraint to apply (i.e. no
   *     search_term and no explicit property_ids and no portfolio scope).
   *   - an array (possibly empty) of property IDs the search must be
   *     restricted to. An empty array means "no property matches" and
   *     the service can short-circuit.
   */
  resolveSearchPropertyIds(opts: {
    searchTerm?: string | null;
    explicitPropertyIds: string[];
    portfolioPropertyIds?: string[] | null;
  }): Promise<string[] | null>;

  /** Property IDs under the given portfolio (direct + via sub-portfolios). */
  getPropertyIdsForPortfolio(portfolioId: string): Promise<string[]>;

  countAndFindJobs(
    filter: ReportsRepositoryFilter,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
    take?: number,
  ): Promise<{ total: number; rows: any[] }>;

  countAndFindRetrievals(
    filter: ReportsRepositoryFilter,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
    take?: number,
  ): Promise<{ total: number; rows: any[] }>;

  /**
   * Lightweight variant of countAndFindJobs that pulls only the columns
   * the service needs to return IDs (plus start_date / end_date for the
   * optional post-filter on job_dates).
   */
  findJobIds(
    filter: ReportsRepositoryFilter,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
  ): Promise<ReportsIdRow[]>;

  /** Same as findJobIds but for the Retrieval collection. */
  findRetrievalIds(
    filter: ReportsRepositoryFilter,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
  ): Promise<ReportsIdRow[]>;
}

export interface IReportsService {
  searchReports(
    body: SearchReportsType,
    user: { userId: string; role: string },
  ): Promise<ReportsSearchResult>;

  /**
   * Same filters as `searchReports`, but ignores pagination and returns
   * every matching job_id / retrieval_id. Intended to feed `Download All`
   * → `POST /jobs/export-master`.
   */
  searchReportIds(
    body: SearchReportsType,
    user: { userId: string; role: string },
  ): Promise<ReportsIdsSearchResult>;

  /**
   * Bundle one XLSX per Job + one XLSX per Retrieval (mirroring the
   * per-job format of /jobs/export-master) into a single downloadable
   * ZIP. Used by the Reports → "Download as Zip" → "Download All" flow.
   */
  exportMaster(
    body: ExportReportsMasterType,
  ): Promise<{ buffer: Buffer; fileName: string }>;
}
