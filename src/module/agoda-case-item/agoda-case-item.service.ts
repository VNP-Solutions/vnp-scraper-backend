import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AgodaCaseItem } from '@prisma/client';
import { IPropertyCredentialsService } from '../property-credentials/property-credentials.interface';
import { buildAgodaCaseItemWipWorkbook } from './agoda-case-item-wip-export.util';
import {
  CreateAgodaCaseItemDto,
  UpdateAgodaCaseItemDto,
} from './agoda-case-item.dto';
import {
  AgodaCaseItemFilters,
  IAgodaCaseItemRepository,
  IAgodaCaseItemService,
  PaginatedAgodaCaseItems,
} from './agoda-case-item.interface';

@Injectable()
export class AgodaCaseItemService implements IAgodaCaseItemService {
  private readonly logger = new Logger(AgodaCaseItemService.name);

  constructor(
    @Inject('IAgodaCaseItemRepository')
    private readonly repository: IAgodaCaseItemRepository,
    @Inject('IPropertyCredentialsService')
    private readonly propertyCredentialsService: IPropertyCredentialsService,
  ) {}

  /**
   * Guards the optional relations before writing. Prisma would reject an
   * unknown id anyway, but a P2025 surfaces as a 500 — checking here turns it
   * into the 404 the API contract promises.
   */
  private async assertRelationsExist(
    data: CreateAgodaCaseItemDto | UpdateAgodaCaseItemDto,
  ): Promise<void> {
    if (
      data.property_id &&
      !(await this.repository.propertyExists(data.property_id))
    ) {
      throw new NotFoundException(
        `Property with ID ${data.property_id} not found`,
      );
    }

    if (data.batch_id && !(await this.repository.batchExists(data.batch_id))) {
      throw new NotFoundException(`Batch with ID ${data.batch_id} not found`);
    }

    if (
      data.portfolio_id &&
      !(await this.repository.portfolioExists(data.portfolio_id))
    ) {
      throw new NotFoundException(
        `Portfolio with ID ${data.portfolio_id} not found`,
      );
    }

    if (data.createdBy && !(await this.repository.userExists(data.createdBy))) {
      throw new NotFoundException(`User with ID ${data.createdBy} not found`);
    }
  }

  async create(data: CreateAgodaCaseItemDto): Promise<AgodaCaseItem> {
    try {
      await this.assertRelationsExist(data);

      const item = await this.repository.create(data);
      this.logger.log(`Agoda case item created (ID: ${item.id})`);
      return item;
    } catch (error) {
      this.logger.error('Error creating agoda case item:', error);
      throw error;
    }
  }

  async findAll(
    filters?: AgodaCaseItemFilters,
  ): Promise<PaginatedAgodaCaseItems> {
    try {
      return await this.repository.findAll(filters);
    } catch (error) {
      this.logger.error('Error finding agoda case items:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<AgodaCaseItem> {
    try {
      const item = await this.repository.findById(id);
      if (!item) {
        throw new NotFoundException(`Agoda case item with ID ${id} not found`);
      }
      return item;
    } catch (error) {
      this.logger.error(`Error finding agoda case item by ID ${id}:`, error);
      throw error;
    }
  }

  async update(
    id: string,
    data: UpdateAgodaCaseItemDto,
  ): Promise<AgodaCaseItem> {
    try {
      const existing = await this.repository.findById(id);
      if (!existing) {
        throw new NotFoundException(`Agoda case item with ID ${id} not found`);
      }

      await this.assertRelationsExist(data);

      const updated = await this.repository.update(id, data);
      this.logger.log(`Agoda case item updated (ID: ${id})`);
      return updated;
    } catch (error) {
      this.logger.error(`Error updating agoda case item ${id}:`, error);
      throw error;
    }
  }

  async delete(
    id: string,
  ): Promise<{ deletedCount: number; deletedId: string }> {
    try {
      const item = await this.repository.findById(id);
      if (!item) {
        throw new NotFoundException(`Agoda case item with ID ${id} not found`);
      }

      await this.repository.delete(id);
      this.logger.log(`Agoda case item deleted (ID: ${id})`);

      return {
        deletedCount: 1,
        deletedId: id,
      };
    } catch (error) {
      this.logger.error(`Error deleting agoda case item ${id}:`, error);
      throw error;
    }
  }

  async exportWip(
    filters?: AgodaCaseItemFilters,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    try {
      const items = await this.repository.findAllForExport(filters);
      this.logger.log(`Exporting ${items.length} agoda case item(s) as WIP xlsx`);
      
      // Decrypt passwords before exporting
      const itemsWithDecryptedPasswords = items.map((item) => {
        const credentials = item.property?.credentials?.[0];
        if (credentials?.agodaPassword) {
          return {
            ...item,
            property: {
              ...item.property,
              credentials: [
                {
                  ...credentials,
                  agodaPassword: this.propertyCredentialsService.decryptPassword(
                    credentials.agodaPassword,
                  ),
                },
              ],
            },
          };
        }
        return item;
      });
      
      return buildAgodaCaseItemWipWorkbook(itemsWithDecryptedPasswords);
    } catch (error) {
      this.logger.error('Error exporting agoda case items as WIP xlsx:', error);
      throw error;
    }
  }

  async exportWipAndArchive(
    filters?: AgodaCaseItemFilters,
  ): Promise<{ buffer: Buffer; fileName: string; archivedCount: number }> {
    try {
      const items = await this.repository.findAllForExport(filters);
      
      // Decrypt passwords before exporting
      const itemsWithDecryptedPasswords = items.map((item) => {
        const credentials = item.property?.credentials?.[0];
        if (credentials?.agodaPassword) {
          return {
            ...item,
            property: {
              ...item.property,
              credentials: [
                {
                  ...credentials,
                  agodaPassword: this.propertyCredentialsService.decryptPassword(
                    credentials.agodaPassword,
                  ),
                },
              ],
            },
          };
        }
        return item;
      });
      
      const { buffer, fileName } = buildAgodaCaseItemWipWorkbook(itemsWithDecryptedPasswords);

      const ids = items.map((item) => item.id);
      const archivedCount = await this.repository.archiveByIds(ids);

      this.logger.log(
        `Exported ${items.length} agoda case item(s) as WIP xlsx and archived ${archivedCount} of them`,
      );

      return { buffer, fileName, archivedCount };
    } catch (error) {
      this.logger.error(
        'Error exporting and archiving agoda case items as WIP xlsx:',
        error,
      );
      throw error;
    }
  }
}
