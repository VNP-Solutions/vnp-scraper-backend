import { Injectable, Logger } from '@nestjs/common';
import { SubPortfolio } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  CreateSubPortfolioDto,
  UpdateSubPortfolioDto,
} from './sub-portfolio.dto';
import { ISubPortfolioRepository } from './sub-portfolio.interface';

@Injectable()
export class SubPortfolioRepository implements ISubPortfolioRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  async create(data: CreateSubPortfolioDto): Promise<SubPortfolio> {
    try {
      const subPortfolio = await this.db.subPortfolio.create({
        data,
      });
      return subPortfolio;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findById(id: string): Promise<SubPortfolio> {
    try {
      const subPortfolio = await this.db.subPortfolio.findUnique({
        where: { id },
      });
      return subPortfolio;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findAll(
    query: Record<string, any>,
  ): Promise<{ data: SubPortfolio[]; metadata: any }> {
    try {
      const {
        search,
        start_date,
        end_date,
        page = 1,
        limit = 10,
        sortBy,
        sortOrder,
        ...filters
      } = query || {};
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);
      let allFilters: any = { ...filters };
      if (search) {
        allFilters.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }
      if (start_date && end_date) {
        allFilters.createdAt = {
          gte: new Date(start_date),
          lte: new Date(end_date),
        };
      }
      let orderBy = undefined;
      if (sortBy) {
        orderBy = {
          [sortBy]: sortOrder?.toLowerCase() === 'desc' ? 'desc' : 'asc',
        };
      }
      const totalDocuments = await this.db.subPortfolio.count({
        where: allFilters,
      });
      const subPortfolios = await this.db.subPortfolio.findMany({
        where: allFilters,
        orderBy,
        include: {
          portfolio: true,
          _count: {
            select: {
              property: true,
            },
          },
        },
        skip,
        take,
      });

      const metadata = {
        totalDocuments,
        currentPage: parseInt(page),
        totalPage: Math.ceil(totalDocuments / parseInt(limit)),
        limit: parseInt(limit),
      };

      return {
        data: subPortfolios.map((sp) => ({
          ...sp,
          propertyCount: sp._count.property,
        })),
        metadata,
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findByPortfolioId(portfolioId: string): Promise<SubPortfolio[]> {
    try {
      const subPortfolios = await this.db.subPortfolio.findMany({
        where: {
          portfolio_id: portfolioId,
        },
        include: {
          portfolio: true,
        },
      });
      return subPortfolios;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async update(id: string, data: UpdateSubPortfolioDto): Promise<SubPortfolio> {
    try {
      const subPortfolio = await this.db.subPortfolio.update({
        where: { id },
        data,
      });
      return subPortfolio;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async delete(id: string): Promise<SubPortfolio> {
    try {
      const subPortfolio = await this.db.subPortfolio.delete({
        where: { id },
      });
      return subPortfolio;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async getPermission(id: string, userId: string): Promise<any> {
    const direct = await this.db.userFeatureAccessPermission.findFirst({
      where: {
        user_id: userId,
        sub_portfolio_id: id,
      },
    });
    if (direct) return direct;

    const subPortfolio = await this.db.subPortfolio.findUnique({
      where: { id },
      select: { portfolio_id: true },
    });
    if (!subPortfolio) return null;

    const portfolioAccess = await this.db.userFeatureAccessPermission.findFirst(
      {
        where: {
          user_id: userId,
          portfolio_id: subPortfolio.portfolio_id,
        },
      },
    );

    return portfolioAccess;
  }

  async getPermissionByPortfolioId(
    portfolioId: string,
    userId: string,
  ): Promise<any> {
    return this.db.userFeatureAccessPermission.findFirst({
      where: {
        user_id: userId,
        portfolio_id: portfolioId,
      },
    });
  }

  async findFilteredSubPortfolios(
    userId: string,
    query?: Record<string, any>,
  ): Promise<{ data: SubPortfolio[]; metadata: any }> {
    try {
      const { page, limit, sortBy, sortOrder, search, start_date, end_date } =
        query || {};
      const skip = page ? (parseInt(page) - 1) * parseInt(limit) : 0;
      const take = limit ? parseInt(limit) : 10;
      let orderBy = undefined;
      if (sortBy) {
        orderBy = {
          [sortBy]: sortOrder?.toLowerCase() === 'desc' ? 'desc' : 'asc',
        };
      }

      // Get accessible sub-portfolio IDs using separate queries
      const accessibleSubPortfolioIds = new Set<string>();

      // 1. Direct sub-portfolio access
      const directAccess = await this.db.userFeatureAccessPermission.findMany({
        where: {
          user_id: userId,
          sub_portfolio_id: { not: null },
        },
        select: { sub_portfolio_id: true },
      });
      directAccess.forEach((perm) => {
        if (perm.sub_portfolio_id)
          accessibleSubPortfolioIds.add(perm.sub_portfolio_id);
      });

      // 2. Portfolio access (indirect access to sub-portfolios)
      const portfolioAccess =
        await this.db.userFeatureAccessPermission.findMany({
          where: {
            user_id: userId,
            portfolio_id: { not: null },
          },
          select: { portfolio_id: true },
        });

      if (portfolioAccess.length > 0) {
        const portfolioIds = portfolioAccess
          .map((p) => p.portfolio_id)
          .filter(Boolean);
        const portfolioSubPortfolios = await this.db.subPortfolio.findMany({
          where: {
            portfolio_id: { in: portfolioIds },
          },
          select: { id: true },
        });
        portfolioSubPortfolios.forEach((sp) =>
          accessibleSubPortfolioIds.add(sp.id),
        );
      }

      // Convert Set to Array for Prisma query
      const accessibleSubPortfolioIdsArray = Array.from(
        accessibleSubPortfolioIds,
      );

      // If no accessible sub-portfolios, return empty result
      if (accessibleSubPortfolioIdsArray.length === 0) {
        return {
          data: [],
          metadata: {
            totalDocuments: 0,
            currentPage: page ? parseInt(page) : 1,
            totalPage: 0,
            limit: take,
          },
        };
      }

      let whereCondition: any = {
        id: { in: accessibleSubPortfolioIdsArray },
      };

      // Add additional filtering conditions
      const additionalConditions = [];

      if (search) {
        additionalConditions.push({
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        });
      }

      if (start_date && end_date) {
        additionalConditions.push({
          createdAt: {
            gte: new Date(start_date),
            lte: new Date(end_date),
          },
        });
      }

      // Combine base condition with additional conditions
      if (additionalConditions.length > 0) {
        whereCondition = {
          AND: [whereCondition, ...additionalConditions],
        };
      }

      const [subPortfolios, totalDocuments] = await Promise.all([
        this.db.subPortfolio.findMany({
          where: whereCondition,
          include: {
            portfolio: true,
            _count: {
              select: {
                property: true,
              },
            },
          },
          skip,
          take,
          orderBy,
        }),
        this.db.subPortfolio.count({
          where: whereCondition,
        }),
      ]);

      const metadata = {
        totalDocuments,
        currentPage: page ? parseInt(page) : 1,
        limit: take,
        totalPage: Math.ceil(totalDocuments / take),
      };

      return {
        data: subPortfolios.map((sp) => ({
          ...sp,
          propertyCount: sp._count.property,
        })),
        metadata,
      };
    } catch (error) {
      this.logger.error(error);
      return { data: [], metadata: null };
    }
  }
}
