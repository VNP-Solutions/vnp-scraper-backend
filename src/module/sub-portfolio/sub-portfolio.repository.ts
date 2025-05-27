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
        ...filters
      } = query || {};
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
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const totalDocuments = await this.db.subPortfolio.count({
        where: allFilters,
      });
      const subPortfolios = await this.db.subPortfolio.findMany({
        where: allFilters,
        include: { portfolio: true },
        skip,
        take: parseInt(limit),
      });
      const metadata = {
        totalDocuments,
        currentPage: parseInt(page),
        totalPage: Math.ceil(totalDocuments / parseInt(limit)),
        limit: parseInt(limit),
      };
      return { data: subPortfolios, metadata };
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
    return this.db.userFeatureAccessPermission.findFirst({
      where: {
        user_id: userId,
        sub_portfolio_id: id,
      },
    });
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

  async findFilteredSubPortfolios(userId: string): Promise<any> {
    return this.db.subPortfolio.findMany({
      where: {
        userFeatureAccessPermissions: {
          some: {
            user_id: userId,
          },
        },
      },
      include: {
        userFeatureAccessPermissions: true,
      },
    });
  }
}
