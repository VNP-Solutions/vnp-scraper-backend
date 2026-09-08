import { Inject, Injectable, Logger } from '@nestjs/common';
import { SubPortfolio } from '@prisma/client';
import {
  CreateSubPortfolioDto,
  SyncBulkUpsertSubPortfolioResultDto,
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

  async syncUpsertByParentId(
    parentId: string,
    portfolioParentId: string,
    name: string,
  ): Promise<{ action: 'created' | 'updated'; id: string }> {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Subportfolio name is required');
    if (!portfolioParentId?.trim()) {
      throw new Error('Portfolio parent ID is required');
    }

    const byId = await this.repository.findById(parentId);
    if (byId) {
      if (
        byId.name !== trimmedName ||
        byId.portfolio_id !== portfolioParentId
      ) {
        const nameHolder = await this.repository.findByName(trimmedName);
        if (nameHolder && nameHolder.id !== parentId) {
          const tempName = `${trimmedName}__legacy_${nameHolder.id}`;
          await this.repository.update(nameHolder.id, { name: tempName });
          await this.repository.reassignPropertiesFromSubPortfolio(
            nameHolder.id,
            parentId,
          );
          await this.repository.delete(nameHolder.id);
        }
        await this.repository.update(parentId, {
          name: trimmedName,
          portfolio_id: portfolioParentId,
        });
      }
      return { action: 'updated', id: parentId };
    }

    const byName = await this.repository.findByName(trimmedName);
    if (byName) {
      if (byName.id !== parentId) {
        const tempName = `${trimmedName}__legacy_${byName.id}`;
        await this.repository.update(byName.id, { name: tempName });
        await this.repository.createWithId(
          parentId,
          trimmedName,
          portfolioParentId,
        );
        await this.repository.reassignPropertiesFromSubPortfolio(
          byName.id,
          parentId,
        );
        await this.repository.delete(byName.id);
        return { action: 'updated', id: parentId };
      }
      return { action: 'updated', id: parentId };
    }

    await this.repository.createWithId(
      parentId,
      trimmedName,
      portfolioParentId,
    );
    return { action: 'created', id: parentId };
  }

  async syncBulkUpsert(
    items: Array<{
      row: number;
      parent_id: string;
      portfolio_parent_id: string;
      name: string;
    }>,
  ): Promise<SyncBulkUpsertSubPortfolioResultDto> {
    const result: SyncBulkUpsertSubPortfolioResultDto = {
      totalRows: items.length,
      createdCount: 0,
      updatedCount: 0,
      failureCount: 0,
      errors: [],
      successfulUpserts: [],
    };

    for (const item of items) {
      const parentId =
        typeof item.parent_id === 'string' ? item.parent_id.trim() : '';
      const portfolioParentId =
        typeof item.portfolio_parent_id === 'string'
          ? item.portfolio_parent_id.trim()
          : '';
      const row = item.row ?? 0;
      const subName = typeof item.name === 'string' ? item.name.trim() : '';

      if (!parentId) {
        result.errors.push({
          row,
          parent_id: 'Unknown',
          error: 'Parent ID is required',
        });
        result.failureCount++;
        continue;
      }

      try {
        const upsert = await this.syncUpsertByParentId(
          parentId,
          portfolioParentId,
          subName,
        );
        if (upsert.action === 'created') result.createdCount++;
        else result.updatedCount++;
        result.successfulUpserts.push({
          parent_id: parentId,
          action: upsert.action,
        });
      } catch (e: any) {
        result.errors.push({
          row,
          parent_id: parentId,
          error: e?.message ?? String(e),
        });
        result.failureCount++;
      }
    }

    return result;
  }
}
