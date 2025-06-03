import { Inject, Injectable, Logger } from '@nestjs/common';
import { SubPortfolio } from '@prisma/client';
import {
  CreateSubPortfolioDto,
  UpdateSubPortfolioDto,
} from './sub-portfolio.dto';
import {
  ISubPortfolioRepository,
  ISubPortfolioService,
} from './sub-portfolio.interface';

@Injectable()
export class SubPortfolioService implements ISubPortfolioService {
  constructor(
    @Inject('ISubPortfolioRepository')
    private readonly repository: ISubPortfolioRepository,
    private readonly logger: Logger,
  ) {}

  async createSubPortfolio(data: CreateSubPortfolioDto): Promise<SubPortfolio> {
    try {
      const subPortfolio = await this.repository.create(data);
      return subPortfolio;
    } catch (error) {
      this.logger.error(
        `Error creating sub-portfolio: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getSubPortfolioById(id: string): Promise<SubPortfolio> {
    try {
      const subPortfolio = await this.repository.findById(id);
      if (!subPortfolio) {
        throw new Error(`Sub-portfolio with ID ${id} not found`);
      }
      return subPortfolio;
    } catch (error) {
      this.logger.error(
        `Error finding sub-portfolio: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAllSubPortfolios(
    query: Record<string, any>,
  ): Promise<any> {
    try {
      return this.repository.findAll(query);
    } catch (error) {
      this.logger.error(
        `Error getting all sub-portfolios: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateSubPortfolio(
    id: string,
    data: UpdateSubPortfolioDto,
  ): Promise<SubPortfolio> {
    try {
      const subPortfolio = await this.repository.update(id, data);
      return subPortfolio;
    } catch (error) {
      this.logger.error(
        `Error updating sub-portfolio: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async deleteSubPortfolio(id: string): Promise<SubPortfolio> {
    try {
      const subPortfolio = await this.repository.delete(id);
      return subPortfolio;
    } catch (error) {
      this.logger.error(
        `Error deleting sub-portfolio: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findSubPortfoliosByPortfolioId(
    portfolioId: string,
  ): Promise<SubPortfolio[]> {
    try {
      const subPortfolios =
        await this.repository.findByPortfolioId(portfolioId);
      if (!subPortfolios.length) {
        this.logger.warn(
          `No sub-portfolios found for portfolio ID ${portfolioId}`,
        );
      }
      return subPortfolios;
    } catch (error) {
      this.logger.error(
        `Error finding sub-portfolios by portfolio ID: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getPermission(id: string, userId: string): Promise<any> {
    return this.repository.getPermission(id, userId);
  }

  async getPermissionByPortfolioId(
    portfolioId: string,
    userId: string,
  ): Promise<any> {
    return this.repository.getPermissionByPortfolioId(portfolioId, userId);
  }

  async getFilteredSubPortfolios(
    userId: string,
    query?: Record<string, any>,
  ): Promise<any> {
    return this.repository.findFilteredSubPortfolios(userId, query);
  }
}
