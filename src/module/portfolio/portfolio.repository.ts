import { Injectable, Logger } from '@nestjs/common';
import { Portfolio } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { CreatePortfolioDto, UpdatePortfolioDto } from './portfolio.dto';
import { IPortfolioRepository } from './portfolio.interface';

@Injectable()
export class PortfolioRepository implements IPortfolioRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  get databaseService(): DatabaseService {
    return this.db;
  }

  async create(data: CreatePortfolioDto, id: string): Promise<Portfolio> {
    try {
      const portfolio = await this.db.portfolio.create({
        data: {
          ...data,
          createdBy: id,
          updatedBy: id,
        },
      });
      return portfolio;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findAll(
    query?: Record<string, any>,
  ): Promise<{ data: Portfolio[]; metadata: any }> {
    try {
      const {
        page,
        limit,
        sortBy,
        sortOrder,
        search,
        start_date,
        end_date,
        ...filters
      } = query || {};
      const skip = page
        ? (parseInt(page || '1') - 1) * parseInt(limit || '10')
        : 0;
      const take = limit ? parseInt(limit) : 10;

      let orderBy = undefined;
      if (sortBy) {
        orderBy = {
          [sortBy]: sortOrder?.toLowerCase() === 'desc' ? 'desc' : 'asc',
        };
      }

      if (start_date && end_date) {
        filters.createdAt = {
          gte: new Date(start_date),
          lte: new Date(end_date),
        };
      }

      let allFilters = { ...filters };
      if (search) {
        allFilters = {
          ...allFilters,
          AND: [
            {
              name: {
                contains: search,
                mode: 'insensitive',
              },
            },
          ],
        };
      }

      const [portfolios, totalDocuments] = await Promise.all([
        this.db.portfolio.findMany({
          where: allFilters,
          skip,
          take,
          orderBy,
          include: {
            _count: {
              select: {
                property: true,
                sub_portfolios: true,
              },
            },
          },
        }),
        this.db.portfolio.count({
          where: allFilters,
        }),
      ]);

      // Get total properties count including those in sub-portfolios
      const portfolioIds = portfolios.map((p) => p.id);
      const [directProperties, subPortfolioProperties] = await Promise.all([
        this.db.property.count({
          where: {
            portfolio_id: {
              in: portfolioIds,
            },
          },
        }),
        this.db.property.count({
          where: {
            subPortfolio: {
              portfolio_id: {
                in: portfolioIds,
              },
            },
          },
        }),
      ]);

      const metadata = {
        totalDocuments,
        currentPage: page ? parseInt(page) : 1,
        limit: take,
        totalPage: Math.ceil(totalDocuments / take)
      };

      return {
        data: portfolios.map((p) => ({
          ...p,
          propertyCount: p._count.property,
          subPortfolioCount: p._count.sub_portfolios,
        })),
        metadata,
      };
    } catch (error) {
      this.logger.error(error);
      return { data: [], metadata: null };
    }
  }

  async findById(id: string): Promise<Portfolio> {
    try {
      const portfolio = await this.db.portfolio.findUnique({
        where: { id },
      });
      return portfolio;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async update(
    id: string,
    data: UpdatePortfolioDto,
    userId: string,
  ): Promise<Portfolio> {
    try {
      const portfolio = await this.db.portfolio.update({
        where: {
          id,
        },
        data: {
          ...data,
          updatedBy: userId,
        },
      });
      return portfolio;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async delete(id: string): Promise<Portfolio> {
    try {
      const portfolio = await this.db.portfolio.delete({
        where: { id },
      });
      return portfolio;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findFilteredPortfolio(
    userId: string,
    query?: Record<string, any>,
  ): Promise<{ data: Portfolio[]; metadata: any }> {
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
      const [portfolios, totalDocuments] = await Promise.all([
        this.db.portfolio.findMany({
          skip,
          take,
          orderBy,
          where: {
            userFeatureAccessPermissions: {
              some: {
                user_id: userId,
              },
            },
          },
          include: {
            _count: {
              select: {
                property: true,
                sub_portfolios: true,
              },
            },
          },
        }),
        this.db.portfolio.count({
          where: {
            userFeatureAccessPermissions: {
              some: {
                user_id: userId,
              },
            },
          },
        }),
      ]);

      // Get total properties count including those in sub-portfolios
      const portfolioIds = portfolios.map((p) => p.id);
      const [directProperties, subPortfolioProperties] = await Promise.all([
        this.db.property.count({
          where: {
            portfolio_id: {
              in: portfolioIds,
            },
          },
        }),
        this.db.property.count({
          where: {
            subPortfolio: {
              portfolio_id: {
                in: portfolioIds,
              },
            },
          },
        }),
      ]);

      const metadata = {
        totalDocuments,
        currentPage: page ? parseInt(page) : 1,
        limit: take,
        totalPage: Math.ceil(totalDocuments / take)
      };

      return {
        data: portfolios.map((p) => ({
          ...p,
          propertyCount: p._count.property,
          subPortfolioCount: p._count.sub_portfolios,
        })),
        metadata,
      };
    } catch (error) {
      this.logger.error(error);
      return { data: [], metadata: null };
    }
  }

  async findPermission(id: string, userId: string): Promise<any> {
    try {
      return this.db.userFeatureAccessPermission.findFirst({
        where: {
          portfolio_id: id,
          user_id: userId,
        },
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }
}
