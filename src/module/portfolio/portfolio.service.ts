import { Inject, Injectable, Logger } from '@nestjs/common';
import { Portfolio } from '@prisma/client';
import { CreatePortfolioDto, UpdatePortfolioDto } from './portfolio.dto';
import { IPortfolioRepository, IPortfolioService } from './portfolio.interface';
const INTERNAL_PORTFOLIO_NAME = 'Internal Portfolio';
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

  async syncCreate(name: string): Promise<{ status: string; id?: string }> {
    const existing = await this.repository.findByName(name);
    if (existing) {
      this.logger.log(`[sync] portfolio already exists: ${name}`);
      return { status: 'already_exists', id: existing.id };
    }
    const created = await this.repository.create({ name }, 'dbms-sync');
    return { status: 'created', id: created.id };
  }

  async syncUpdate(oldName: string, newName: string): Promise<{ status: string; id?: string }> {
    const existing = await this.repository.findByName(oldName);
    if (!existing) {
      this.logger.warn(`[sync] portfolio not found for update, creating: ${newName}`);
      const created = await this.repository.create({ name: newName }, 'dbms-sync');
      return { status: 'created', id: created?.id };
    }
    const clash = await this.repository.findByName(newName);
    if (clash && clash.id !== existing.id) {
      this.logger.warn(`[sync] target name already exists, skipping: ${newName}`);
      return { status: 'conflict', id: clash.id };
    }
    const updated = await this.repository.update(existing.id, { name: newName }, 'dbms-sync');
    return { status: 'updated', id: updated?.id };
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

  async syncDelete(name: string): Promise<{ status: string; id?: string; movedProperties?: number }> {
    const existing = await this.repository.findByName(name);
    if (!existing) {
      this.logger.warn(`[sync] portfolio not found for delete: ${name}`);
      return { status: 'not_found' };
    }
    if (name.trim().toLowerCase() === INTERNAL_PORTFOLIO_NAME.toLowerCase()) {
      this.logger.warn(`[sync] refusing to delete internal portfolio`);
      return { status: 'skipped_internal', id: existing.id };
    }
    const internal = await this.repository.ensureInternalPortfolio();
    const moved = await this.repository.reassignPropertiesToPortfolio(existing.id, internal.id);
    await this.repository.delete(existing.id);
    this.logger.log(`[sync] portfolio deleted: ${name}, moved ${moved} properties to internal`);
    return { status: 'deleted', id: existing.id, movedProperties: moved };
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
