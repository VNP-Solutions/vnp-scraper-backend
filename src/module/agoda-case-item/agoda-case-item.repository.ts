import { Injectable, Logger } from '@nestjs/common';
import { AgodaCaseItem, Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  CreateAgodaCaseItemDto,
  UpdateAgodaCaseItemDto,
} from './agoda-case-item.dto';
import {
  AgodaCaseItemFilters,
  AgodaCaseItemForExport,
  IAgodaCaseItemRepository,
  PaginatedAgodaCaseItems,
} from './agoda-case-item.interface';

@Injectable()
export class AgodaCaseItemRepository implements IAgodaCaseItemRepository {
  private readonly logger = new Logger(AgodaCaseItemRepository.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Turns the flat *_id fields on the DTO into Prisma relation writes. All
   * relations are optional: an absent id is left untouched, while an
   * explicit null clears the link so an update can detach a case item.
   */
  private toRelationInput(
    data: CreateAgodaCaseItemDto | UpdateAgodaCaseItemDto,
  ): Prisma.AgodaCaseItemCreateInput {
    const {
      property_id,
      batch_id,
      portfolio_id,
      retrieval_id,
      createdBy,
      ...rest
    } = data;

    return {
      ...rest,
      ...this.relationWrite('property', property_id),
      ...this.relationWrite('batch', batch_id),
      ...this.relationWrite('portfolio', portfolio_id),
      ...this.relationWrite('retrieval', retrieval_id),
      ...this.relationWrite('creator', createdBy),
    };
  }

  private relationWrite(
    relation: 'property' | 'batch' | 'portfolio' | 'retrieval' | 'creator',
    id: string | null | undefined,
  ): Record<string, unknown> {
    if (id === undefined) return {};
    if (id === null) return { [relation]: { disconnect: true } };
    return { [relation]: { connect: { id } } };
  }

  async create(data: CreateAgodaCaseItemDto): Promise<AgodaCaseItem> {
    try {
      return await this.db.agodaCaseItem.create({
        data: this.toRelationInput(data),
      });
    } catch (error) {
      this.logger.error('Error creating agoda case item:', error);
      throw error;
    }
  }

  /** Shared between findAll and findAllForExport so the two never drift apart. */
  private buildWhere(
    filters?: AgodaCaseItemFilters,
  ): Prisma.AgodaCaseItemWhereInput {
    const where: Prisma.AgodaCaseItemWhereInput = {};

    if (filters?.ids?.length) where.id = { in: filters.ids };
    if (filters?.property_id) where.property_id = filters.property_id;
    if (filters?.batch_id) where.batch_id = filters.batch_id;
    if (filters?.portfolio_id) where.portfolio_id = filters.portfolio_id;
    if (filters?.retrival_status) {
      where.retrival_status = filters.retrival_status;
    }
    if (filters?.charge_status) where.charge_status = filters.charge_status;
    if (filters?.is_missing !== undefined) {
      where.is_missing = filters.is_missing;
    }
    if (filters?.posting_type) where.posting_type = filters.posting_type;
    if (filters?.createdBy) where.createdBy = filters.createdBy;
    if (filters?.is_archived !== undefined) {
      where.is_archived = filters.is_archived;
    }
    if (filters?.is_declined !== undefined) {
      where.is_declined = filters.is_declined;
    }

    if (filters?.search) {
      const searchTerm = filters.search.toString().trim();
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchTerm);

      where.OR = [
        ...(isValidObjectId ? [{ id: searchTerm }] : []),
        {
          reservation_id: {
            contains: searchTerm,
            mode: 'insensitive' as const,
          },
        },
        {
          guest_name: { contains: searchTerm, mode: 'insensitive' as const },
        },
        {
          vcc_card_number: {
            contains: searchTerm,
            mode: 'insensitive' as const,
          },
        },
        {
          property: {
            is: {
              name: { contains: searchTerm, mode: 'insensitive' as const },
            },
          },
        },
        {
          portfolio: {
            is: {
              name: { contains: searchTerm, mode: 'insensitive' as const },
            },
          },
        },
      ];
    }

    return where;
  }

  async findAll(
    filters?: AgodaCaseItemFilters,
  ): Promise<PaginatedAgodaCaseItems> {
    try {
      const page = filters?.page || 1;
      const limit = filters?.limit || 10;
      const skip = (page - 1) * limit;
      const order = filters?.order || 'desc';

      const where = this.buildWhere(filters);

      const [items, totalDocuments] = await Promise.all([
        this.db.agodaCaseItem.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: order },
        }),
        this.db.agodaCaseItem.count({ where }),
      ]);

      return {
        items,
        totalDocuments,
        currentPage: page,
        totalPage: Math.ceil(totalDocuments / limit),
        limit,
      };
    } catch (error) {
      this.logger.error('Error finding agoda case items:', error);
      throw error;
    }
  }

  async findAllForExport(
    filters?: AgodaCaseItemFilters,
  ): Promise<AgodaCaseItemForExport[]> {
    try {
      const where = this.buildWhere(filters);
      const order = filters?.order || 'desc';

      return (await this.db.agodaCaseItem.findMany({
        where,
        orderBy: { createdAt: order },
        include: {
          property: { include: { credentials: true } },
          batch: true,
          portfolio: true,
          creator: true,
        },
      })) as AgodaCaseItemForExport[];
    } catch (error) {
      this.logger.error('Error finding agoda case items for export:', error);
      throw error;
    }
  }

  async archiveByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    try {
      const result = await this.db.agodaCaseItem.updateMany({
        where: { id: { in: ids } },
        data: { is_archived: true },
      });
      return result.count;
    } catch (error) {
      this.logger.error('Error archiving agoda case items:', error);
      throw error;
    }
  }

  async declineByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    try {
      const result = await this.db.agodaCaseItem.updateMany({
        where: { id: { in: ids } },
        data: {
          charge_status: 'declined',
          is_declined: true,
        },
      });
      return result.count;
    } catch (error) {
      this.logger.error('Error declining agoda case items:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<AgodaCaseItem | null> {
    try {
      return await this.db.agodaCaseItem.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Error finding agoda case item by id ${id}:`, error);
      throw error;
    }
  }

  async update(
    id: string,
    data: UpdateAgodaCaseItemDto,
  ): Promise<AgodaCaseItem> {
    try {
      return await this.db.agodaCaseItem.update({
        where: { id },
        data: this.toRelationInput(data),
      });
    } catch (error) {
      this.logger.error(`Error updating agoda case item ${id}:`, error);
      throw error;
    }
  }

  async delete(id: string): Promise<AgodaCaseItem> {
    try {
      return await this.db.agodaCaseItem.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Error deleting agoda case item ${id}:`, error);
      throw error;
    }
  }

  async propertyExists(propertyId: string): Promise<boolean> {
    try {
      const property = await this.db.property.findUnique({
        where: { id: propertyId },
        select: { id: true },
      });
      return !!property;
    } catch (error) {
      this.logger.error(`Error checking property ${propertyId}:`, error);
      throw error;
    }
  }

  async batchExists(batchId: string): Promise<boolean> {
    try {
      const batch = await this.db.batch.findUnique({
        where: { id: batchId },
        select: { id: true },
      });
      return !!batch;
    } catch (error) {
      this.logger.error(`Error checking batch ${batchId}:`, error);
      throw error;
    }
  }

  async portfolioExists(portfolioId: string): Promise<boolean> {
    try {
      const portfolio = await this.db.portfolio.findUnique({
        where: { id: portfolioId },
        select: { id: true },
      });
      return !!portfolio;
    } catch (error) {
      this.logger.error(`Error checking portfolio ${portfolioId}:`, error);
      throw error;
    }
  }

  async userExists(userId: string): Promise<boolean> {
    try {
      const user = await this.db.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      return !!user;
    } catch (error) {
      this.logger.error(`Error checking user ${userId}:`, error);
      throw error;
    }
  }

  async bulkCreate(data: CreateAgodaCaseItemDto[]): Promise<AgodaCaseItem[]> {
    try {
      // Convert to relation input format
      const createData = data.map((item) => this.toRelationInput(item));
      
      // Use createMany for bulk insert (faster but doesn't return created records)
      // Then fetch the created records
      await this.db.agodaCaseItem.createMany({
        data: createData,
      });

      // Return empty array since createMany doesn't return created records
      // If you need the created records, you'd need to create them one by one
      return [];
    } catch (error) {
      this.logger.error('Error bulk creating agoda case items:', error);
      throw error;
    }
  }

  async findPropertyByAgodaId(agodaId: string): Promise<{ id: string } | null> {
    try {
      const property = await this.db.property.findFirst({
        where: { agoda_id: agodaId },
        select: { id: true },
      });
      return property;
    } catch (error) {
      this.logger.error(`Error finding property by agoda_id ${agodaId}:`, error);
      throw error;
    }
  }

  async findBatchByName(batchName: string): Promise<{ id: string } | null> {
    try {
      const batch = await this.db.batch.findFirst({
        where: { name: batchName },
        select: { id: true },
      });
      return batch;
    } catch (error) {
      this.logger.error(`Error finding batch by name ${batchName}:`, error);
      throw error;
    }
  }

  async findPortfolioByName(portfolioName: string): Promise<{ id: string } | null> {
    try {
      const portfolio = await this.db.portfolio.findFirst({
        where: { name: portfolioName },
        select: { id: true },
      });
      return portfolio;
    } catch (error) {
      this.logger.error(`Error finding portfolio by name ${portfolioName}:`, error);
      throw error;
    }
  }
}
