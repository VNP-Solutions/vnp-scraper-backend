import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  IReportsRepository,
  ReportsCurrentCounts,
  ReportsIdRow,
  ReportsRepositoryFilter,
} from './reports.interface';

@Injectable()
export class ReportsRepository implements IReportsRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  async getAccessScopeForUser(userId: string): Promise<{
    propertyIds: string[];
    portfolioIds: string[];
    subPortfolioIds: string[];
  }> {
    try {
      const perms = await this.db.userFeatureAccessPermission.findMany({
        where: { user_id: userId },
        select: {
          portfolio_id: true,
          sub_portfolio_id: true,
          property_id: true,
        },
      });

      const portfolioIds = new Set<string>();
      const subPortfolioIds = new Set<string>();
      const directPropertyIds = new Set<string>();
      for (const p of perms) {
        if (p.portfolio_id) portfolioIds.add(p.portfolio_id);
        if (p.sub_portfolio_id) subPortfolioIds.add(p.sub_portfolio_id);
        if (p.property_id) directPropertyIds.add(p.property_id);
      }

      // Properties under accessible portfolios / sub-portfolios are also visible.
      const propertyIds = new Set<string>(directPropertyIds);
      if (portfolioIds.size > 0 || subPortfolioIds.size > 0) {
        const props = await this.db.property.findMany({
          where: {
            OR: [
              ...(portfolioIds.size > 0
                ? [
                    { portfolio_id: { in: Array.from(portfolioIds) } },
                    {
                      subPortfolio: {
                        portfolio_id: { in: Array.from(portfolioIds) },
                      },
                    },
                  ]
                : []),
              ...(subPortfolioIds.size > 0
                ? [{ sub_portfolio_id: { in: Array.from(subPortfolioIds) } }]
                : []),
            ],
          },
          select: { id: true },
        });
        for (const p of props) propertyIds.add(p.id);
      }

      return {
        propertyIds: Array.from(propertyIds),
        portfolioIds: Array.from(portfolioIds),
        subPortfolioIds: Array.from(subPortfolioIds),
      };
    } catch (error) {
      this.logger.error(
        `Error computing access scope for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getSubPortfolioIdsForPortfolio(portfolioId: string): Promise<string[]> {
    try {
      const rows = await this.db.subPortfolio.findMany({
        where: { portfolio_id: portfolioId },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    } catch (error) {
      this.logger.error(
        `Error fetching sub-portfolios for portfolio ${portfolioId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getPropertyIdsForPortfolio(portfolioId: string): Promise<string[]> {
    try {
      const rows = await this.db.property.findMany({
        where: {
          OR: [
            { portfolio_id: portfolioId },
            { subPortfolio: { portfolio_id: portfolioId } },
          ],
        },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    } catch (error) {
      this.logger.error(
        `Error fetching properties for portfolio ${portfolioId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async resolveSearchPropertyIds(opts: {
    searchTerm?: string | null;
    explicitPropertyIds: string[];
    portfolioPropertyIds?: string[] | null;
  }): Promise<string[] | null> {
    const term = (opts.searchTerm ?? '').toString().trim();
    const explicit = opts.explicitPropertyIds ?? [];
    const portfolioScope = opts.portfolioPropertyIds ?? null;

    // No search term + no explicit selection + no portfolio scope → caller
    // can run with no property constraint.
    if (!term && explicit.length === 0 && portfolioScope === null) {
      return null;
    }

    // No search term, but explicit / portfolio scope provided → intersect
    // those two lists.
    if (!term) {
      if (portfolioScope === null) return explicit;
      if (explicit.length === 0) return portfolioScope;
      const portfolioSet = new Set(portfolioScope);
      return explicit.filter((id) => portfolioSet.has(id));
    }

    // We have a search term. Build a Property where clause and intersect
    // with the explicit/portfolio scope using AND.
    const numericTerm = Number(term);
    const isNumeric =
      term.length > 0 && !isNaN(numericTerm) && Number.isInteger(numericTerm);

    const orClauses: Prisma.PropertyWhereInput[] = [
      { name: { contains: term, mode: 'insensitive' } },
    ];
    if (isNumeric) {
      orClauses.push(
        { expedia_id: numericTerm },
        { booking_id: numericTerm },
        { agoda_id: numericTerm },
      );
    }

    const andClauses: Prisma.PropertyWhereInput[] = [{ OR: orClauses }];
    if (explicit.length > 0) {
      andClauses.push({ id: { in: explicit } });
    }
    if (portfolioScope !== null) {
      andClauses.push({ id: { in: portfolioScope } });
    }

    try {
      const rows = await this.db.property.findMany({
        where: { AND: andClauses },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    } catch (error) {
      this.logger.error(
        `Error resolving search property IDs: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private buildJobWhereClause(
    filter: ReportsRepositoryFilter,
  ): Record<string, any> {
    const where: Record<string, any> = {};

    if (filter.propertyIdScope !== null) {
      where.property_id = { in: filter.propertyIdScope };
    }

    if (filter.portfolioScope) {
      const scopeOR: any[] = [];
      if (filter.portfolioScope.portfolioIds.length > 0) {
        scopeOR.push({
          portfolio_id: { in: filter.portfolioScope.portfolioIds },
        });
      }
      if (filter.portfolioScope.subPortfolioIds.length > 0) {
        scopeOR.push({
          sub_portfolio_id: { in: filter.portfolioScope.subPortfolioIds },
        });
      }
      if (scopeOR.length > 0) {
        // AND-ed with any property scope via the top-level AND below.
        where.AND = (where.AND ?? []).concat([{ OR: scopeOR }]);
      } else {
        // Explicit empty scope → no rows can match.
        where.AND = (where.AND ?? []).concat([{ id: '__no_match__' }]);
      }
    }

    if (filter.otaProviders.length > 0) {
      where.ota_provider = { in: filter.otaProviders };
    }

    if (filter.jobStatuses.length > 0) {
      where.job_status = { in: filter.jobStatuses };
    }

    if (filter.batchIds.length > 0) {
      where.batch_id = { in: filter.batchIds };
    }

    if (filter.executionTypes.length > 0) {
      where.execution_type = { in: filter.executionTypes };
    }

    if (filter.runWithin && (filter.runWithin.from || filter.runWithin.to)) {
      const range: Record<string, Date> = {};
      if (filter.runWithin.from) range.gte = filter.runWithin.from;
      if (filter.runWithin.to) range.lte = filter.runWithin.to;
      where.updatedAt = range;
    }

    // start_date / end_date are stored as MM/DD/YYYY strings in the DB,
    // so date-range comparison must happen post-fetch in the service.
    // Here we only enforce a presence check when a bound is provided.
    if (filter.startDate && (filter.startDate.from || filter.startDate.to)) {
      where.start_date = { not: null };
    }
    if (filter.endDate && (filter.endDate.from || filter.endDate.to)) {
      where.end_date = { not: null };
    }

    if (!filter.includeArchived) {
      where.is_archived = false;
    }

    if (filter.billingTypes.length > 0) {
      // billing_type is stored as a free string (e.g. "DB", "VCC"). Match
      // case-insensitively by issuing one regex per value.
      where.OR = (where.OR ?? []).concat(
        filter.billingTypes.map((t) => ({
          billing_type: { equals: t, mode: 'insensitive' },
        })),
      );
    }

    if (filter.cardOver160 !== undefined) {
      where.tags = {
        some: { field: 'over_160', value: filter.cardOver160 },
      };
    }

    if (filter.priority !== undefined) {
      where.priority = filter.priority;
    }

    return where;
  }

  async countAndFindJobs(
    filter: ReportsRepositoryFilter,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
    take?: number,
  ): Promise<{ total: number; rows: any[] }> {
    try {
      const where = this.buildJobWhereClause(filter);

      const orderBy: Record<string, 'asc' | 'desc'> = { [sortBy]: sortOrder };

      const [total, rows] = await Promise.all([
        this.db.job.count({ where: where as any }),
        this.db.job.findMany({
          where: where as any,
          orderBy,
          ...(typeof take === 'number' ? { take } : {}),
          include: {
            property: {
              select: {
                id: true,
                name: true,
                expedia_id: true,
                booking_id: true,
                agoda_id: true,
              },
            },
            portfolio: { select: { id: true, name: true } },
            subPortfolio: { select: { id: true, name: true } },
            batch: { select: { id: true, name: true } },
          },
        }),
      ]);

      return { total, rows };
    } catch (error) {
      this.logger.error(
        `Error querying jobs for reports search: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findJobIds(
    filter: ReportsRepositoryFilter,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
  ): Promise<ReportsIdRow[]> {
    try {
      const where = this.buildJobWhereClause(filter);

      const rows = await this.db.job.findMany({
        where: where as any,
        orderBy: { [sortBy]: sortOrder },
        // Pull start_date / end_date too so the service can apply the
        // job-dates post-filter without a second query.
        select: { id: true, start_date: true, end_date: true },
      });
      return rows;
    } catch (error) {
      this.logger.error(
        `Error fetching job IDs for reports search: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getStatistics(
    filter: ReportsRepositoryFilter,
  ): Promise<ReportsCurrentCounts> {
    try {
      const where = this.buildJobWhereClause(filter);

      const [
        pendingCount,
        failedCount,
        runningCount,
        completedCount,
        stoppedCount,
        nothingToReportCount,
        manualCount,
        highPriorityCount,
        totalCount,
      ] = await Promise.all([
        this.db.job.count({
          where: { ...(where as any), job_status: 'Pending' },
        }),
        this.db.job.count({
          where: { ...(where as any), job_status: 'Failed' },
        }),
        this.db.job.count({
          where: { ...(where as any), job_status: 'Running' },
        }),
        this.db.job.count({
          where: { ...(where as any), job_status: 'Completed' },
        }),
        this.db.job.count({
          where: { ...(where as any), job_status: 'Stopped' },
        }),
        this.db.job.count({
          where: { ...(where as any), job_status: 'NothingToReport' },
        }),
        this.db.job.count({
          where: { ...(where as any), job_status: 'Manual' },
        }),
        this.db.job.count({
          where: { ...(where as any), priority: 1 },
        }),
        this.db.job.count({ where: where as any }),
      ]);

      const pct = (count: number): number =>
        totalCount > 0 ? Math.round((count / totalCount) * 10000) / 100 : 0;

      return {
        pending: { count: pendingCount, percentage: pct(pendingCount) },
        failed: { count: failedCount, percentage: pct(failedCount) },
        running: { count: runningCount, percentage: pct(runningCount) },
        completed: { count: completedCount, percentage: pct(completedCount) },
        stopped: { count: stoppedCount, percentage: pct(stoppedCount) },
        nothingToReport: {
          count: nothingToReportCount,
          percentage: pct(nothingToReportCount),
        },
        manual: { count: manualCount, percentage: pct(manualCount) },
        highPriority: {
          count: highPriorityCount,
          percentage: pct(highPriorityCount),
        },
        total: totalCount,
      };
    } catch (error) {
      this.logger.error(
        `Error computing report statistics: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
