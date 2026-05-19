import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  IReportsRepository,
  IReportsService,
  ReportsRepositoryFilter,
  ReportsResultItem,
  ReportsSearchResult,
} from './reports.interface';
import type { SearchReportsType } from './reports.validation';

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
    private readonly logger: Logger,
  ) {}

  async searchReports(
    body: SearchReportsType,
    user: { userId: string; role: string },
  ): Promise<ReportsSearchResult> {
    try {
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

        // Non-admin with zero accessible properties / portfolios short-
        // circuits to an empty result rather than running an expensive
        // global query.
        if (
          accessPropertyIds.length === 0 &&
          accessPortfolioIds.length === 0 &&
          accessSubPortfolioIds.length === 0
        ) {
          return this.emptyResult(body);
        }
      }

      // ---------- 2. Determine which collections to query ------------------
      const jobTypes = body.job_types ?? [];
      const wantsJobs =
        jobTypes.length === 0 ||
        jobTypes.includes('VCC') ||
        jobTypes.includes('DB');
      const wantsRetrievals =
        jobTypes.length === 0 || jobTypes.includes('Retrieval');
      const billingTypes = jobTypes.filter(
        (t) => t === 'VCC' || t === 'DB',
      ) as string[];

      // ---------- 3. Resolve the property scope ----------------------------
      // (portfolio mode → properties under selected portfolio, intersected
      //  with user access; further restricted by search_term/property_ids).
      let portfolioPropertyIds: string[] | null = null;
      if (body.search_mode === 'portfolio' && body.portfolio_id) {
        portfolioPropertyIds =
          await this.repository.getPropertyIdsForPortfolio(body.portfolio_id);

        // Non-admin user trying to read a portfolio they have no
        // permission on → constrain to their own accessible IDs.
        if (!isAdmin && accessPropertyIds) {
          const accessSet = new Set(accessPropertyIds);
          portfolioPropertyIds = portfolioPropertyIds.filter((id) =>
            accessSet.has(id),
          );
        }

        if (portfolioPropertyIds.length === 0) {
          return this.emptyResult(body);
        }
      }

      // Combine explicit property_ids + portfolio scope into the seed list
      // we pass to the property text-search resolver.
      const resolvedPropertyIds = await this.repository.resolveSearchPropertyIds(
        {
          searchTerm: body.search_term,
          explicitPropertyIds: body.property_ids ?? [],
          portfolioPropertyIds,
        },
      );

      // resolvedPropertyIds === null  → no property-level constraint
      // resolvedPropertyIds === []    → caller searched for something that
      //                                  matched no properties (e.g. expedia
      //                                  id that doesn't exist) → short
      //                                  circuit to empty.
      if (resolvedPropertyIds !== null && resolvedPropertyIds.length === 0) {
        return this.emptyResult(body);
      }

      let finalPropertyScope: string[] | null = resolvedPropertyIds;

      // Layer the user access permission on top (non-admin only). The
      // property-id list is the most granular access vector; if both lists
      // are present we intersect them.
      if (!isAdmin && accessPropertyIds !== null && finalPropertyScope !== null) {
        const access = new Set(accessPropertyIds);
        finalPropertyScope = finalPropertyScope.filter((id) => access.has(id));
        if (finalPropertyScope.length === 0) {
          return this.emptyResult(body);
        }
      } else if (!isAdmin && finalPropertyScope === null) {
        // No explicit property scope from the search; fall back to the
        // user's accessible property IDs.
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
      };

      // ---------- 5. Execute queries ---------------------------------------
      // start_date / end_date are stored as MM/DD/YYYY strings, so when a
      // job-dates filter is present we have to fetch all matching rows
      // and post-filter in memory. Otherwise we use Prisma's count + a
      // bounded take for an efficient merged pagination.
      const needsPostDateFilter = !!(
        body.job_dates &&
        (body.job_dates.start_date || body.job_dates.end_date)
      );

      const sortBy = body.sortBy ?? 'updatedAt';
      const sortOrder: 'asc' | 'desc' = body.sortOrder ?? 'desc';
      const page = body.page ?? 1;
      const limit = body.limit ?? 10;
      const skip = (page - 1) * limit;

      // In the no-post-filter path we still need enough rows from each
      // collection to cover the requested page after merging — fetch up
      // to (skip + limit) from each.
      const take = needsPostDateFilter ? undefined : skip + limit;

      const [jobsResult, retrievalsResult] = await Promise.all([
        wantsJobs
          ? this.repository.countAndFindJobs(filter, sortBy, sortOrder, take)
          : Promise.resolve({ total: 0, rows: [] as any[] }),
        wantsRetrievals
          ? this.repository.countAndFindRetrievals(
              filter,
              sortBy,
              sortOrder,
              take,
            )
          : Promise.resolve({ total: 0, rows: [] as any[] }),
      ]);

      // ---------- 6. Normalize ----------------------------------------------
      let normalizedJobs: ReportsResultItem[] = jobsResult.rows.map((j) =>
        this.normalizeJob(j),
      );
      let normalizedRetrievals: ReportsResultItem[] =
        retrievalsResult.rows.map((r) => this.normalizeRetrieval(r));

      // ---------- 7. Post-filter on Job/Retrieval start_date/end_date ------
      let totalJobs = jobsResult.total;
      let totalRetrievals = retrievalsResult.total;

      if (needsPostDateFilter) {
        const from = parseFlexibleDate(body.job_dates?.start_date);
        const to = parseFlexibleDate(body.job_dates?.end_date);

        normalizedJobs = normalizedJobs.filter((row) =>
          this.rowOverlapsJobDateRange(row, from, to),
        );
        normalizedRetrievals = normalizedRetrievals.filter((row) =>
          this.rowOverlapsJobDateRange(row, from, to),
        );

        // After post-filter the Prisma counts are stale; use the filtered
        // lengths so the metadata reflects what the client actually sees.
        totalJobs = normalizedJobs.length;
        totalRetrievals = normalizedRetrievals.length;
      }

      // ---------- 8. Merge + sort + paginate -------------------------------
      const merged = this.sortMerged(
        [...normalizedJobs, ...normalizedRetrievals],
        sortBy,
        sortOrder,
      );

      const totalDocuments = totalJobs + totalRetrievals;
      const pageRows = merged.slice(skip, skip + limit);

      return {
        data: pageRows,
        metadata: {
          totalDocuments,
          totalJobs,
          totalRetrievals,
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

  private emptyResult(body: SearchReportsType): ReportsSearchResult {
    const page = body.page ?? 1;
    const limit = body.limit ?? 10;
    return {
      data: [],
      metadata: {
        totalDocuments: 0,
        totalJobs: 0,
        totalRetrievals: 0,
        currentPage: page,
        totalPage: 0,
        limit,
      },
    };
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
    if (
      accessPortfolioIds.length === 0 &&
      accessSubPortfolioIds.length === 0
    ) {
      return null;
    }
    return {
      portfolioIds: accessPortfolioIds,
      subPortfolioIds: accessSubPortfolioIds,
    };
  }

  /**
   * Maps "Manual"/"Recurring" UI labels to the values stored in
   * Job.execution_type. The current data layer stores Manual / Recurring
   * verbatim (matched case-insensitively at the DB layer via `in`).
   */
  private resolveExecutionTypes(types: ('Manual' | 'Recurring')[]): string[] {
    if (types.length === 0) return [];
    const set = new Set<string>();
    for (const t of types) {
      if (t === 'Manual') {
        set.add('Manual');
        set.add('manual');
      } else if (t === 'Recurring') {
        set.add('Recurring');
        set.add('recurring');
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
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    };
  }

  private normalizeRetrieval(r: any): ReportsResultItem {
    return {
      source: 'retrieval',
      id: r.id,
      name: r.name ?? null,
      job_status: r.job_status,
      ota_provider: r.ota_provider,
      // Retrieval has a billing_type column too; surface it as-is.
      billing_type: r.billing_type ?? null,
      execution_type: r.execution_type ?? null,
      portfolio_id: r.portfolio_id ?? null,
      portfolio_name: r.portfolio?.name ?? r.portfolio_name ?? null,
      sub_portfolio_id: r.sub_portfolio_id ?? null,
      sub_portfolio_name: r.subPortfolio?.name ?? r.sub_portfolio_name ?? null,
      property_id: r.property_id ?? null,
      property_name: r.property_name ?? r.property?.name ?? '',
      batch_id: r.batch_id ?? null,
      batch_name: r.batch?.name ?? null,
      start_date: r.start_date ?? null,
      end_date: r.end_date ?? null,
      is_archived: r.is_archived ?? false,
      property: r.property
        ? {
            id: r.property.id,
            name: r.property.name,
            expedia_id: r.property.expedia_id ?? null,
            booking_id: r.property.booking_id ?? null,
            agoda_id: r.property.agoda_id ?? null,
          }
        : null,
      failed_reason: r.failed_reason ?? '',
      screenshot_urls: Array.isArray(r.screenshot_urls)
        ? r.screenshot_urls
        : [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
