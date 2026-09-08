import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  buildHumanReadableTimestamp,
  zipFiles,
} from '../../common/utils/zip-and-filename.util';
import { IJobService } from '../job/job.interface';
import {
  IReportsRepository,
  IReportsService,
  ReportsCurrentCounts,
  ReportsIdRow,
  ReportsIdsSearchResult,
  ReportsRepositoryFilter,
  ReportsResultItem,
  ReportsSearchResult,
} from './reports.interface';
import type {
  ExportReportsMasterType,
  SearchReportsType,
} from './reports.validation';

/**
 * Outcome of the shared "resolve filters + access scope" pass. `null`
 * means nothing can match (callers should short-circuit to an empty
 * response); otherwise the returned object carries the repository
 * filter ready to be applied against the Job collection.
 *
 * (Retrievals were dropped from the Reports module — every Reports
 * endpoint now operates on Jobs only.)
 */
type ReportsSearchPlan = {
  filter: ReportsRepositoryFilter;
  needsPostDateFilter: boolean;
} | null;

/**
 * Strict admin role. Non-admins are scoped by UserFeatureAccessPermission.
 * Aligned with the rest of the codebase (e.g. property.controller checks
 * `user.role === 'admin'` directly).
 */
const ADMIN_ROLE = 'admin';

const MMDDYYYY_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** Parse MM/DD/YYYY (and a few other common formats) into a Date. */
function parseFlexibleDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const str = input.toString().trim();
  if (!str) return null;

  // MM/DD/YYYY → use explicit parts so we avoid Date's locale-dependent
  // parsing of slash dates.
  const m = str.match(MMDDYYYY_REGEX);
  if (m) {
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    const d = new Date(year, month - 1, day);
    return isNaN(d.getTime()) ? null : d;
  }

  // Otherwise hand off to Date (ISO and similar).
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class ReportsService implements IReportsService {
  constructor(
    @Inject('IReportsRepository')
    private readonly repository: IReportsRepository,
    @Inject('IJobService')
    private readonly jobService: IJobService,
    private readonly logger: Logger,
  ) {}

  async searchReports(
    body: SearchReportsType,
    user: { userId: string; role: string },
  ): Promise<ReportsSearchResult> {
    try {
      const plan = await this.buildSearchPlan(body, user);
      if (plan === null) return this.emptyResult(body);

      const { filter, needsPostDateFilter } = plan;

      const sortBy = body.sortBy ?? 'updatedAt';
      const sortOrder: 'asc' | 'desc' = body.sortOrder ?? 'desc';
      const page = body.page ?? 1;
      const limit = body.limit ?? 10;
      const skip = (page - 1) * limit;

      // In the no-post-filter path we still need enough rows to cover the
      // requested page — fetch up to (skip + limit) from the Job collection.
      const take = needsPostDateFilter ? undefined : skip + limit;

      const jobsResult = await this.repository.countAndFindJobs(
        filter,
        sortBy,
        sortOrder,
        take,
      );

      // ---------- 6. Normalize ----------------------------------------------
      let normalizedJobs: ReportsResultItem[] = jobsResult.rows.map((j) =>
        this.normalizeJob(j),
      );

      // ---------- 7. Post-filter on Job.start_date/end_date ----------------
      let totalJobs = jobsResult.total;

      if (needsPostDateFilter) {
        const from = parseFlexibleDate(body.job_dates?.start_date);
        const to = parseFlexibleDate(body.job_dates?.end_date);

        normalizedJobs = normalizedJobs.filter((row) =>
          this.rowOverlapsJobDateRange(row, from, to),
        );

        // After post-filter the Prisma count is stale; use the filtered
        // length so the metadata reflects what the client actually sees.
        totalJobs = normalizedJobs.length;
      }

      // ---------- 8. Sort + paginate ----------------------------------------
      const sorted = this.sortMerged(normalizedJobs, sortBy, sortOrder);

      const totalDocuments = totalJobs;
      const pageRows = sorted.slice(skip, skip + limit);

      return {
        data: pageRows,
        metadata: {
          totalDocuments,
          totalJobs,
          currentPage: page,
          totalPage: Math.max(1, Math.ceil(totalDocuments / limit)),
          limit,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error running reports search: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Returns every matching job_id for the given filter payload, ignoring
   * pagination. Designed to feed the "Download All" action → frontend
   * pipes `data.job_ids` straight into `POST /reports/export-master`
   * (or the legacy `POST /jobs/export-master`).
   */
  async searchReportIds(
    body: SearchReportsType,
    user: { userId: string; role: string },
  ): Promise<ReportsIdsSearchResult> {
    try {
      const plan = await this.buildSearchPlan(body, user);
      if (plan === null) return this.emptyIdsResult();

      const { filter, needsPostDateFilter } = plan;

      // Sort still matters here — frontend may want the IDs ordered the
      // same way as the visible list so the export CSVs come out in a
      // predictable order.
      const sortBy = body.sortBy ?? 'updatedAt';
      const sortOrder: 'asc' | 'desc' = body.sortOrder ?? 'desc';

      const jobRows: ReportsIdRow[] = await this.repository.findJobIds(
        filter,
        sortBy,
        sortOrder,
      );

      let filteredJobs = jobRows;

      if (needsPostDateFilter) {
        const from = parseFlexibleDate(body.job_dates?.start_date);
        const to = parseFlexibleDate(body.job_dates?.end_date);
        filteredJobs = jobRows.filter((row) =>
          this.idRowOverlapsJobDateRange(row, from, to),
        );
      }

      const job_ids = filteredJobs.map((r) => r.id);

      return {
        job_ids,
        metadata: {
          totalJobs: job_ids.length,
          totalDocuments: job_ids.length,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error fetching report IDs: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getStatistics(
    body: SearchReportsType,
    user: { userId: string; role: string },
  ): Promise<ReportsCurrentCounts> {
    try {
      // Strip job_statuses so the status breakdown is never pre-filtered,
      // strip priority so the high-priority count is computed independently,
      // and strip pagination/sort fields which are irrelevant for counts.
      const {
        job_statuses: _s,
        priority: _priority,
        page: _p,
        limit: _l,
        sortBy: _sb,
        sortOrder: _so,
        ...statsBody
      } = body;
      const plan = await this.buildSearchPlan(
        statsBody as SearchReportsType,
        user,
      );
      if (plan === null) {
        return {
          pending: { count: 0, percentage: 0 },
          failed: { count: 0, percentage: 0 },
          running: { count: 0, percentage: 0 },
          completed: { count: 0, percentage: 0 },
          stopped: { count: 0, percentage: 0 },
          nothingToReport: { count: 0, percentage: 0 },
          manual: { count: 0, percentage: 0 },
          highPriority: { count: 0, percentage: 0 },
          total: 0,
        };
      }

      return await this.repository.getStatistics(plan.filter);
    } catch (error) {
      this.logger.error(
        `Error computing report statistics: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Jobs-only "Download All" export. Produces a single ZIP containing
   * one XLSX per job, named `{OTA}-{property}-{startDate}-{endDate}.xlsx`.
   *
   * (Retrievals were dropped from the Reports module — if/when a bulk
   * retrieval export is needed it should live under the retrieval
   * module, not here.)
   */
  async exportMaster(
    body: ExportReportsMasterType,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    try {
      const jobIds = Array.from(new Set(body.job_ids ?? [])).filter(Boolean);

      if (jobIds.length === 0) {
        throw new BadRequestException('At least one job ID is required');
      }

      const entries = await this.jobService.buildMasterXlsxEntries(jobIds);

      if (entries.length === 0) {
        throw new NotFoundException(
          'No exportable content found for the provided job IDs (jobs had no items, or all IDs were invalid).',
        );
      }

      const buffer = await zipFiles(entries);
      const fileName = `reports-export-${buildHumanReadableTimestamp()}.zip`;
      return { buffer, fileName };
    } catch (error) {
      this.logger.error(
        `Error exporting reports master ZIP: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Consolidated report export. Loads every job referenced by
   * `body.job_ids` and renders ALL of their job items into a single
   * "Master" sheet inside one XLSX workbook — same columns and per-OTA
   * rules as the per-job CSV produced by `/jobs/export-master`.
   *
   * Returns the XLSX directly (not a ZIP) so the frontend can hand it
   * straight to the user without an extra unzip step.
   */
  async exportConsolidated(
    body: ExportReportsMasterType,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    try {
      const jobIds = Array.from(new Set(body.job_ids ?? [])).filter(Boolean);
      if (jobIds.length === 0) {
        throw new BadRequestException('At least one job ID is required');
      }

      // The heavy lifting (loading, header derivation, per-row rendering,
      // text-format application) lives on the Job service so the same
      // logic powers both this endpoint and the legacy per-job export.
      return await this.jobService.buildConsolidatedMasterXlsx(jobIds);
    } catch (error) {
      this.logger.error(
        `Error exporting consolidated reports XLSX: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Dashboard report export. Same body shape as `exportConsolidated`,
   * but renders rows using the simplified dashboard column spec
   * (OTA / Hotel ID / Batch / Review Collection Date / Portfolio /
   * Hotel Name / Reservation ID / Status / Name / Check In / Check Out /
   * Currency / Amount Collected / Due To Property / Due To VNP).
   *
   * Returns a single XLSX (not a ZIP). All per-row business logic
   * (Hotel-ID-by-OTA, the 85 / 15 Due-To-Property/VNP split, etc.) lives
   * inside the job service so this method is a thin orchestration layer.
   */
  async exportDashboard(
    body: ExportReportsMasterType,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    try {
      const jobIds = Array.from(new Set(body.job_ids ?? [])).filter(Boolean);
      if (jobIds.length === 0) {
        throw new BadRequestException('At least one job ID is required');
      }
      return await this.jobService.buildDashboardXlsx(jobIds);
    } catch (error) {
      this.logger.error(
        `Error exporting dashboard reports XLSX: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private emptyResult(body: SearchReportsType): ReportsSearchResult {
    const page = body.page ?? 1;
    const limit = body.limit ?? 10;
    return {
      data: [],
      metadata: {
        totalDocuments: 0,
        totalJobs: 0,
        currentPage: page,
        totalPage: 0,
        limit,
      },
    };
  }

  private emptyIdsResult(): ReportsIdsSearchResult {
    return {
      job_ids: [],
      metadata: { totalJobs: 0, totalDocuments: 0 },
    };
  }

  /**
   * Shared filter-and-scope resolution used by both `searchReports` and
   * `searchReportIds`. Returns `null` when the request can never match
   * anything (e.g. non-admin with no permissions, or a search term that
   * resolved to zero properties) so callers can short-circuit.
   */
  private async buildSearchPlan(
    body: SearchReportsType,
    user: { userId: string; role: string },
  ): Promise<ReportsSearchPlan> {
    const isAdmin = user?.role === ADMIN_ROLE;

    // ---------- 1. User access scope (permissions for non-admin) ---------
    let accessPropertyIds: string[] | null = null;
    let accessPortfolioIds: string[] = [];
    let accessSubPortfolioIds: string[] = [];
    if (!isAdmin) {
      const scope = await this.repository.getAccessScopeForUser(user.userId);
      accessPropertyIds = scope.propertyIds;
      accessPortfolioIds = scope.portfolioIds;
      accessSubPortfolioIds = scope.subPortfolioIds;

      if (
        accessPropertyIds.length === 0 &&
        accessPortfolioIds.length === 0 &&
        accessSubPortfolioIds.length === 0
      ) {
        return null;
      }
    }

    // ---------- 2. Job-type → billing_type filter ------------------------
    // The Reports module queries only the Job collection now (retrievals
    // were dropped). A `'Retrieval'` value inside `job_types` is silently
    // accepted for backwards compatibility but contributes nothing to
    // the where clause.
    const jobTypes = body.job_types ?? [];
    const billingTypes = jobTypes.filter(
      (t) => t === 'VCC' || t === 'DB',
    ) as string[];

    // ---------- 3. Resolve the property scope ----------------------------
    // Route purely on the presence of `portfolio_id`. `search_mode` is
    // accepted for backwards-compatibility but no longer affects routing —
    // sending `portfolio_id` (with or without `search_mode`) always scopes
    // by portfolio, and omitting it always means "all properties the user
    // can see".
    let portfolioPropertyIds: string[] | null = null;
    if (body.portfolio_id) {
      portfolioPropertyIds = await this.repository.getPropertyIdsForPortfolio(
        body.portfolio_id,
      );

      if (!isAdmin && accessPropertyIds) {
        const accessSet = new Set(accessPropertyIds);
        portfolioPropertyIds = portfolioPropertyIds.filter((id) =>
          accessSet.has(id),
        );
      }

      if (portfolioPropertyIds.length === 0) {
        return null;
      }
    }

    const resolvedPropertyIds = await this.repository.resolveSearchPropertyIds({
      searchTerm: body.search_term,
      explicitPropertyIds: body.property_ids ?? [],
      portfolioPropertyIds,
    });

    if (resolvedPropertyIds !== null && resolvedPropertyIds.length === 0) {
      return null;
    }

    let finalPropertyScope: string[] | null = resolvedPropertyIds;

    if (!isAdmin && accessPropertyIds !== null && finalPropertyScope !== null) {
      const access = new Set(accessPropertyIds);
      finalPropertyScope = finalPropertyScope.filter((id) => access.has(id));
      if (finalPropertyScope.length === 0) return null;
    } else if (!isAdmin && finalPropertyScope === null) {
      finalPropertyScope = accessPropertyIds;
    }

    // ---------- 4. Build the repository filter --------------------------
    const filter: ReportsRepositoryFilter = {
      propertyIdScope: finalPropertyScope,
      portfolioScope: this.buildPortfolioScope(
        body,
        isAdmin,
        accessPortfolioIds,
        accessSubPortfolioIds,
      ),
      otaProviders: body.ota_providers ?? [],
      jobStatuses: body.job_statuses ?? [],
      executionTypes: this.resolveExecutionTypes(body.frequency_types ?? []),
      batchIds: body.batch_ids ?? [],
      runWithin: this.normalizeDateRange(
        body.run_within?.from,
        body.run_within?.to,
      ),
      startDate: this.normalizeDateRange(
        body.job_dates?.start_date,
        body.job_dates?.end_date,
      ),
      endDate: this.normalizeDateRange(
        body.job_dates?.start_date,
        body.job_dates?.end_date,
      ),
      includeArchived: body.include_archived ?? false,
      cardOver160: this.resolveCardOver160(body.card_periods ?? []),
      billingTypes,
      priority: body.priority,
    };

    const needsPostDateFilter = !!(
      body.job_dates &&
      (body.job_dates.start_date || body.job_dates.end_date)
    );

    return {
      filter,
      needsPostDateFilter,
    };
  }

  /** Variant of `rowOverlapsJobDateRange` that works on the id-only row shape. */
  private idRowOverlapsJobDateRange(
    row: ReportsIdRow,
    from: Date | null,
    to: Date | null,
  ): boolean {
    if (!from && !to) return true;
    const rowStart = parseFlexibleDate(row.start_date ?? null);
    const rowEnd = parseFlexibleDate(row.end_date ?? null) ?? rowStart;
    if (!rowStart && !rowEnd) return false;
    const effectiveStart = rowStart ?? rowEnd!;
    const effectiveEnd = rowEnd ?? rowStart!;
    if (from && effectiveEnd < from) return false;
    if (to && effectiveStart > to) return false;
    return true;
  }

  private buildPortfolioScope(
    body: SearchReportsType,
    isAdmin: boolean,
    accessPortfolioIds: string[],
    accessSubPortfolioIds: string[],
  ): ReportsRepositoryFilter['portfolioScope'] {
    // Admin in portfolio mode: scope by the selected portfolio + its
    // sub-portfolios. We don't precompute sub-portfolio IDs here because
    // the repository's property-id scope already restricts results to
    // properties under that portfolio. Setting portfolioScope to null
    // keeps the where clause smaller.
    if (isAdmin) {
      return null;
    }

    // Non-admin: also OR in their portfolio / sub-portfolio access so
    // jobs/retrievals that don't have a property_id but DO belong to an
    // accessible portfolio still show up.
    if (accessPortfolioIds.length === 0 && accessSubPortfolioIds.length === 0) {
      return null;
    }
    return {
      portfolioIds: accessPortfolioIds,
      subPortfolioIds: accessSubPortfolioIds,
    };
  }

  /**
   * Maps the `frequency_types` UI labels (already lowercased by the Zod
   * preprocess on `FrequencyTypeEnum`) onto the literal strings stored
   * in `Job.execution_type`. Both casings are emitted for each label so
   * the DB-side `in` clause matches the historical mix of values.
   *
   *   'manual'    → 'Manual',    'manual'
   *   'immediate' → 'Immediate', 'immediate'  (this is the default value
   *                  the Excel-import path writes when no execution-type
   *                  cell is present — see `job.service.ts`).
   */
  private resolveExecutionTypes(types: ('manual' | 'immediate')[]): string[] {
    if (types.length === 0) return [];
    const set = new Set<string>();
    for (const t of types) {
      if (t === 'manual') {
        set.add('Manual');
        set.add('manual');
      } else if (t === 'immediate') {
        set.add('Immediate');
        set.add('immediate');
      }
    }
    return Array.from(set);
  }

  private resolveCardOver160(
    periods: ('Over160' | 'Under160')[],
  ): boolean | undefined {
    const hasOver = periods.includes('Over160');
    const hasUnder = periods.includes('Under160');
    if (hasOver && !hasUnder) return true;
    if (hasUnder && !hasOver) return false;
    return undefined;
  }

  private normalizeDateRange(
    from?: string | null,
    to?: string | null,
  ): { from?: Date; to?: Date } | null {
    const fromDate = parseFlexibleDate(from);
    const toDate = parseFlexibleDate(to);
    if (!fromDate && !toDate) return null;
    const range: { from?: Date; to?: Date } = {};
    if (fromDate) range.from = fromDate;
    if (toDate) {
      // Make `to` inclusive to end-of-day to match common UX expectations
      // when the caller sends a date-only string.
      toDate.setHours(23, 59, 59, 999);
      range.to = toDate;
    }
    return range;
  }

  private rowOverlapsJobDateRange(
    row: ReportsResultItem,
    from: Date | null,
    to: Date | null,
  ): boolean {
    if (!from && !to) return true;
    const rowStart = parseFlexibleDate(row.start_date);
    const rowEnd = parseFlexibleDate(row.end_date) ?? rowStart;
    // If neither bound is on the row, we can't say it overlaps; drop it.
    if (!rowStart && !rowEnd) return false;
    const effectiveStart = rowStart ?? rowEnd!;
    const effectiveEnd = rowEnd ?? rowStart!;
    if (from && effectiveEnd < from) return false;
    if (to && effectiveStart > to) return false;
    return true;
  }

  private sortMerged(
    rows: ReportsResultItem[],
    sortBy: string,
    sortOrder: 'asc' | 'desc',
  ): ReportsResultItem[] {
    const direction = sortOrder === 'asc' ? 1 : -1;
    const isDateField = sortBy === 'updatedAt' || sortBy === 'createdAt';
    const isMmddyyyyField = sortBy === 'start_date' || sortBy === 'end_date';

    return [...rows].sort((a, b) => {
      const aRaw = (a as any)[sortBy];
      const bRaw = (b as any)[sortBy];

      const aVal = this.normalizeSortValue(aRaw, isDateField, isMmddyyyyField);
      const bVal = this.normalizeSortValue(bRaw, isDateField, isMmddyyyyField);

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1; // nulls last
      if (bVal === null || bVal === undefined) return -1;
      if (aVal < bVal) return -1 * direction;
      if (aVal > bVal) return 1 * direction;
      return 0;
    });
  }

  private normalizeSortValue(
    value: unknown,
    isDateField: boolean,
    isMmddyyyyField: boolean,
  ): number | string | null {
    if (value === null || value === undefined) return null;
    if (isDateField) {
      if (value instanceof Date) return value.getTime();
      const d = new Date(value as string);
      return isNaN(d.getTime()) ? null : d.getTime();
    }
    if (isMmddyyyyField && typeof value === 'string') {
      const d = parseFlexibleDate(value);
      return d ? d.getTime() : null;
    }
    if (typeof value === 'string') return value.toLowerCase();
    if (typeof value === 'number') return value;
    return String(value);
  }

  private normalizeJob(j: any): ReportsResultItem {
    return {
      source: 'job',
      id: j.id,
      name: j.name ?? null,
      job_status: j.job_status,
      ota_provider: j.ota_provider,
      billing_type: j.billing_type ?? null,
      execution_type: j.execution_type ?? null,
      portfolio_id: j.portfolio_id ?? null,
      portfolio_name: j.portfolio?.name ?? j.portfolio_name ?? null,
      sub_portfolio_id: j.sub_portfolio_id ?? null,
      sub_portfolio_name: j.subPortfolio?.name ?? j.sub_portfolio_name ?? null,
      property_id: j.property_id ?? null,
      property_name: j.property_name ?? j.property?.name ?? '',
      batch_id: j.batch_id ?? null,
      batch_name: j.batch?.name ?? null,
      start_date: j.start_date ?? null,
      end_date: j.end_date ?? null,
      is_archived: j.is_archived ?? false,
      property: j.property
        ? {
            id: j.property.id,
            name: j.property.name,
            expedia_id: j.property.expedia_id ?? null,
            booking_id: j.property.booking_id ?? null,
            agoda_id: j.property.agoda_id ?? null,
          }
        : null,
      failed_reason: j.failed_reason ?? '',
      screenshot_urls: Array.isArray(j.screenshot_urls)
        ? j.screenshot_urls
        : [],
      // `Job.tags` is an embedded array of { field, value } entries.
      // Always emit an array (empty when the job has no tags) so the
      // frontend can assume a stable shape.
      tags: Array.isArray(j.tags) ? j.tags : [],
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    };
  }
}
