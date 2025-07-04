import { Inject, Injectable, Logger } from '@nestjs/common';
import { Portfolio } from '@prisma/client';
import { CreatePortfolioDto, UpdatePortfolioDto } from './portfolio.dto';
import { IPortfolioRepository, IPortfolioService } from './portfolio.interface';

@Injectable()
export class PortfolioService implements IPortfolioService {
  constructor(
    @Inject('IPortfolioRepository')
    private readonly repository: IPortfolioRepository,
    private readonly logger: Logger,
  ) {}

  async createPortfolio(
    data: CreatePortfolioDto,
    id: string,
  ): Promise<Portfolio> {
    try {
      const portfolio = await this.repository.create(data, id);
      return portfolio;
    } catch (error) {
      this.logger.error(
        `Error creating portfolio: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAllPortfolios(
    query?: Record<string, any>,
  ): Promise<{ data: Portfolio[]; metadata: any }> {
    try {
      const result = await this.repository.findAll(query);
      return result;
    } catch (error) {
      this.logger.error(
        `Error getting portfolios: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getPortfolioById(id: string): Promise<Portfolio> {
    try {
      const portfolio = await this.repository.findById(id);
      if (!portfolio) {
        throw new Error(`Portfolio with ID ${id} not found`);
      }
      return portfolio;
    } catch (error) {
      this.logger.error(
        `Error finding portfolio: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updatePortfolio(
    id: string,
    data: UpdatePortfolioDto,
    userId: string,
  ): Promise<Portfolio> {
    try {
      const portfolio = await this.repository.update(id, data, userId);
      return portfolio;
    } catch (error) {
      this.logger.error(
        `Error updating portfolio: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async deletePortfolio(id: string): Promise<any> {
    try {
      await this.repository.delete(id);
    } catch (error) {
      this.logger.error(
        `Error deleting portfolio: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getFilteredPortfolio(
    userId: string,
  ): Promise<{ data: Portfolio[]; metadata: any }> {
    try {
      const result = await this.repository.findFilteredPortfolio(userId);
      return result;
    } catch (error) {
      this.logger.error(
        `Error searching portfolios: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getPermission(id: string, userId: string): Promise<any> {
    return this.repository.findPermission(id, userId);
  }
}
