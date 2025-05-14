import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SubPortfolio } from '@prisma/client';
import { CreateSubPortfolioDto, UpdateSubPortfolioDto } from './sub-portfolio.dto';
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

  async findAll(query: string): Promise<SubPortfolio[]> {
    try {
      const subPortfolios = await this.db.subPortfolio.findMany({
        where: {
          OR: [
            {
              name: {
                contains: query,
                mode: 'insensitive',
              },
            },
            {
              description: {
                contains: query,
                mode: 'insensitive',
              },
            },
          ],
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

  async findByPortfolioId(portfolioId: string): Promise<SubPortfolio[]> {
    try {
      const subPortfolios = await this.db.subPortfolio.findMany({
        where: {
          portfolio_id: portfolioId
        },
        include: {
          portfolio: true
        }
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
}