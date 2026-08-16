import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Portfolio } from '@prisma/client';
import {
  CreatePortfolioDto,
  SyncBulkUpsertPortfolioItemDto,
  SyncBulkUpsertPortfolioResultDto,
  UpdatePortfolioDto,
} from './portfolio.dto';
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

  async syncCreate(
    name: string,
    parentId?: string,
  ): Promise<{ status: string; id?: string }> {
    if (parentId) {
      const byParent = await this.repository.findByParentId(parentId);
      if (byParent) {
        this.logger.log(
          `[sync] portfolio already exists by parent_id: ${parentId}`,
        );
        return { status: 'already_exists', id: byParent.id };
      }
    }
    const existing = await this.repository.findByName(name);
    if (existing) {
      if (parentId && !existing.parent_id) {
        await this.repository.update(
          existing.id,
          { parent_id: parentId } as any,
          'dbms-sync',
        );
      }
      this.logger.log(`[sync] portfolio already exists: ${name}`);
      return { status: 'already_exists', id: existing.id };
    }
    const created = await this.repository.create(
      { name, parent_id: parentId } as any,
      'dbms-sync',
    );
    return { status: 'created', id: created.id };
  }

  async syncUpdate(
    oldName: string,
    newName: string,
  ): Promise<{ status: string; id?: string }> {
    const existing = await this.repository.findByName(oldName);
    if (!existing) {
      this.logger.warn(
        `[sync] portfolio not found for update, creating: ${newName}`,
      );
      const created = await this.repository.create(
        { name: newName },
        'dbms-sync',
      );
      return { status: 'created', id: created?.id };
    }
    const clash = await this.repository.findByName(newName);
    if (clash && clash.id !== existing.id) {
      this.logger.warn(
        `[sync] target name already exists, skipping: ${newName}`,
      );
      return { status: 'conflict', id: clash.id };
    }
    const updated = await this.repository.update(
      existing.id,
      { name: newName },
      'dbms-sync',
    );
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

  async syncUpsert(
    parentId: string,
    name: string,
  ): Promise<{ action: 'created' | 'updated'; portfolio: Portfolio }> {
    const trimmedParent = (parentId ?? '').trim();
    const trimmedName = (name ?? '').trim();
    if (!trimmedParent) throw new BadRequestException('Parent ID is required');
    if (!trimmedName)
      throw new BadRequestException('Portfolio name is required');

    const existing = await this.repository.findByParentId(trimmedParent);
    if (existing) {
      if (trimmedName !== existing.name) {
        const clash = await this.repository.findByName(trimmedName);
        if (clash && clash.id !== existing.id) {
          throw new ConflictException(
            'Portfolio with this name already exists',
          );
        }
      }
      const updated = await this.repository.update(
        existing.id,
        { name: trimmedName, parent_id: trimmedParent } as any,
        'dbms-sync',
      );
      if (!updated) throw new Error('Failed to update portfolio');
      return { action: 'updated', portfolio: updated };
    }

    const nameClash = await this.repository.findByName(trimmedName);
    if (nameClash) {
      throw new ConflictException('Portfolio with this name already exists');
    }
    const created = await this.repository.create(
      { name: trimmedName, parent_id: trimmedParent } as any,
      'dbms-sync',
    );
    if (!created) throw new Error('Failed to create portfolio');
    return { action: 'created', portfolio: created };
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

  async syncDelete(
    name: string,
  ): Promise<{ status: string; id?: string; movedProperties?: number }> {
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
    const moved = await this.repository.reassignPropertiesToPortfolio(
      existing.id,
      internal.id,
    );
    await this.repository.delete(existing.id);
    this.logger.log(
      `[sync] portfolio deleted: ${name}, moved ${moved} properties to internal`,
    );
    return { status: 'deleted', id: existing.id, movedProperties: moved };
  }

  async syncBulkUpsert(
    items: SyncBulkUpsertPortfolioItemDto[],
  ): Promise<SyncBulkUpsertPortfolioResultDto> {
    if (!Array.isArray(items) || !items.length) {
      throw new BadRequestException('No items provided');
    }

    const result: SyncBulkUpsertPortfolioResultDto = {
      totalRows: items.length,
      createdCount: 0,
      updatedCount: 0,
      failureCount: 0,
      errors: [],
      successfulUpserts: [],
    };

    for (const item of items) {
      const rowNumber = item.row;
      const parentId =
        typeof item.parent_id === 'string' ? item.parent_id.trim() : '';

      if (!Number.isInteger(rowNumber) || rowNumber < 1) {
        result.errors.push({
          row: Number.isInteger(rowNumber) ? rowNumber : 0,
          parent_id: parentId || 'Unknown',
          error: 'Row is required and must be a positive integer',
        });
        result.failureCount++;
        continue;
      }

      if (!parentId) {
        result.errors.push({
          row: rowNumber,
          parent_id: 'Unknown',
          error: 'Parent ID is required',
        });
        result.failureCount++;
        continue;
      }

      try {
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        if (!name) {
          throw new Error('Portfolio name is required');
        }

        const { action } = await this.syncUpsert(parentId, name);
        if (action === 'created') {
          result.createdCount++;
        } else {
          result.updatedCount++;
        }
        result.successfulUpserts.push({ parent_id: parentId, action });
      } catch (error) {
        result.errors.push({
          row: rowNumber,
          parent_id: parentId,
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
        });
        result.failureCount++;
      }
    }

    return result;
  }

  async syncDeleteByParentId(parentId: string): Promise<{ message: string }> {
    const trimmedParent = (parentId ?? '').trim();
    if (!trimmedParent) throw new BadRequestException('Parent ID is required');
    const existing = await this.repository.findByParentId(trimmedParent);
    if (!existing) {
      throw new NotFoundException(
        `Portfolio not found with parent_id: ${trimmedParent}`,
      );
    }
    if (
      existing.name.trim().toLowerCase() ===
      INTERNAL_PORTFOLIO_NAME.toLowerCase()
    ) {
      throw new BadRequestException('Cannot delete Internal Portfolio');
    }
    const internal = await this.repository.ensureInternalPortfolio();
    await this.repository.reassignPropertiesToPortfolio(
      existing.id,
      internal.id,
    );
    await this.repository.delete(existing.id);
    return { message: 'Portfolio deleted successfully' };
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
