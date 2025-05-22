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

  async findAll(name?: string): Promise<Portfolio[]> {
    try {
      const portfolios = await this.db.portfolio.findMany({
        where: name
          ? {
              name: {
                contains: name,
              },
            }
          : undefined,
      });
      return portfolios;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findById(id: string): Promise<Portfolio> {
    try {
      const portfolio = await this.db.portfolio.findUnique({
        where: {
          id,
        },
      });
      return portfolio;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async update(id: string, data: UpdatePortfolioDto, userId: string): Promise<Portfolio> {
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
        where: {
          id,
        },
      });
      return portfolio;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findFilteredPortfolio(userId: string): Promise<any> {
    try {
      return this.db.portfolio.findMany({
        where: {
          userFeatureAccessPermissions: {
            some: {
              user_id: userId,
            },
          }
        },
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findPermission(id: string, userId: string): Promise<any> {
    try {
      return this.db.userFeatureAccessPermission.findFirst({
        where: {
          user_id: userId,
          portfolio_id: id,
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
}
