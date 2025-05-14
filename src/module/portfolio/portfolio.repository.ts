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

  async create(data: CreatePortfolioDto): Promise<Portfolio> {
    try {
      const portfolio = await this.db.portfolio.create({
        data,
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

  async update(id: string, data: UpdatePortfolioDto): Promise<Portfolio> {
    try {
      const portfolio = await this.db.portfolio.update({
        where: {
          id,
        },
        data,
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
}
