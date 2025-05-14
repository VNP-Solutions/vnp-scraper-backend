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

  async createPortfolio(data: CreatePortfolioDto): Promise<Portfolio> {
    try {
      const portfolio = await this.repository.create(data);
      return portfolio;
    } catch (error) {
      this.logger.error(
        `Error creating portfolio: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAllPortfolios(name?: string): Promise<Portfolio[]> {
    try {
      const portfolios = await this.repository.findAll(name);
      return portfolios;
    } catch (error) {
      this.logger.error(
        `Error searching portfolios: ${error.message}`,
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
  ): Promise<Portfolio> {
    try {
      const portfolio = await this.repository.update(id, data);
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
}
