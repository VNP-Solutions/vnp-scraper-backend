import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AgodaCaseItem, PostingType } from '@prisma/client';
import * as XLSX from 'xlsx';
import { IPropertyCredentialsService } from '../property-credentials/property-credentials.interface';
import { IRetrievalService } from '../retrieval/retrieval.interface';
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
    @Inject('IRetrievalService')
    private readonly retrievalService: IRetrievalService,
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

  async findByReservationAndProperty(
    reservationId: string,
    propertyId: string,
  ): Promise<AgodaCaseItem | null> {
    try {
      return await this.repository.findByReservationAndProperty(
        reservationId,
        propertyId,
      );
    } catch (error) {
      this.logger.error(
        `Error finding agoda case item by reservation ${reservationId} / property ${propertyId}:`,
        error,
      );
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

  async bulkDecline(ids: string[]): Promise<number> {
    try {
      const declinedCount = await this.repository.declineByIds(ids);
      this.logger.log(
        `Marked ${declinedCount} agoda case item(s) as declined`,
      );
      return declinedCount;
    } catch (error) {
      this.logger.error('Error marking agoda case items as declined:', error);
      throw error;
    }
  }

  async importWipDeclined(
    file: Express.Multer.File,
    archive: boolean,
  ): Promise<{
    successCount: number;
    failedCount: number;
    totalRows: number;
    errors: string[];
  }> {
    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet);

      this.logger.log(`Processing ${rows.length} rows from Excel file`);

      const itemsToCreate: CreateAgodaCaseItemDto[] = [];
      const errors: string[] = [];
      let rowIndex = 2; // Start at 2 because Excel row 1 is header

      for (const row of rows) {
        try {
          // Required fields validation
          const hotelId = row['Hotel ID']?.toString().trim();
          const reservationId = row['Reservation ID']?.toString().trim();
          const guestName = row['Name']?.toString().trim();
          const checkIn = row['Check In']?.toString().trim();
          const checkOut = row['Check Out']?.toString().trim();
          const postingType = row['Posting Type']?.toString().trim();
          const otaProvider = row['OTA Provider']?.toString().trim();
          const currency = row['Currency']?.toString().trim();
          const amountToCharge = row['Amount to charge']?.toString().trim();
          const cardFirst4 = row['Card first 4']?.toString().trim();
          const cardLast12 = row['Card last 12']?.toString().trim();
          const cardExpire = row['Card Expire']?.toString().trim();
          const cardCvv = row['Card CVV']?.toString().trim();

          // Validate required fields
          if (!hotelId) {
            errors.push(`Row ${rowIndex}: Missing Hotel ID`);
            rowIndex++;
            continue;
          }
          if (!reservationId) {
            errors.push(`Row ${rowIndex}: Missing Reservation ID`);
            rowIndex++;
            continue;
          }
          if (!guestName) {
            errors.push(`Row ${rowIndex}: Missing Guest Name`);
            rowIndex++;
            continue;
          }
          if (!checkIn) {
            errors.push(`Row ${rowIndex}: Missing Check In date`);
            rowIndex++;
            continue;
          }
          if (!checkOut) {
            errors.push(`Row ${rowIndex}: Missing Check Out date`);
            rowIndex++;
            continue;
          }
          if (!currency) {
            errors.push(`Row ${rowIndex}: Missing Currency`);
            rowIndex++;
            continue;
          }
          if (!amountToCharge) {
            errors.push(`Row ${rowIndex}: Missing Amount to charge`);
            rowIndex++;
            continue;
          }
          if (!cardFirst4 || !cardLast12) {
            errors.push(`Row ${rowIndex}: Missing Card Number (first 4 or last 12)`);
            rowIndex++;
            continue;
          }
          if (!cardExpire) {
            errors.push(`Row ${rowIndex}: Missing Card Expire`);
            rowIndex++;
            continue;
          }
          if (!cardCvv) {
            errors.push(`Row ${rowIndex}: Missing Card CVV`);
            rowIndex++;
            continue;
          }

          // Lookup property by agoda_id
          const property = await this.repository.findPropertyByAgodaId(hotelId);
          if (!property) {
            errors.push(`Row ${rowIndex}: Property not found for Hotel ID: ${hotelId}`);
            rowIndex++;
            continue;
          }

          // Optional lookups
          let batchId: string | undefined;
          const batchName = row['Batch']?.toString().trim();
          if (batchName) {
            const batch = await this.repository.findBatchByName(batchName);
            if (batch) {
              batchId = batch.id;
            }
          }

          let portfolioId: string | undefined;
          const portfolioName = row['Portfolio']?.toString().trim();
          if (portfolioName) {
            const portfolio = await this.repository.findPortfolioByName(portfolioName);
            if (portfolio) {
              portfolioId = portfolio.id;
            }
          }

          // Combine card number
          const vccCardNumber = cardFirst4 + cardLast12;

          // Parse isMissing
          const isMissingValue = row['isMissing']?.toString().trim().toLowerCase();
          const isMissing = isMissingValue === 'yes' || isMissingValue === 'true';

          // Create item DTO
          const item: CreateAgodaCaseItemDto = {
            property_id: property.id,
            batch_id: batchId,
            portfolio_id: portfolioId,
            reservation_id: reservationId,
            guest_name: guestName,
            check_in: checkIn,
            check_out: checkOut,
            currency: currency,
            amount_to_charge: amountToCharge,
            vcc_card_number: vccCardNumber,
            card_expire: cardExpire,
            card_cvv: cardCvv,
            is_missing: isMissing,
            charge_status: row['Charge Status']?.toString().trim() || undefined,
            retrival_status: 'pending',
            ota_provider: otaProvider as any || 'Agoda',
            posting_type: postingType as any,
            is_declined: true,
            is_archived: archive,
            // createdBy not set - will be null
          };

          itemsToCreate.push(item);
        } catch (error) {
          errors.push(`Row ${rowIndex}: ${error.message}`);
        }

        rowIndex++;
      }

      // Bulk create items
      if (itemsToCreate.length > 0) {
        await this.repository.bulkCreate(itemsToCreate);
      }

      const successCount = itemsToCreate.length;
      const failedCount = rows.length - successCount;

      this.logger.log(
        `Import completed: ${successCount} succeeded, ${failedCount} failed`,
      );

      return {
        successCount,
        failedCount,
        totalRows: rows.length,
        errors,
      };
    } catch (error) {
      this.logger.error('Error importing WIP declined items:', error);
      throw error;
    }
  }

  async sendToRetrieval(
    ids: string[],
    userId: string,
  ): Promise<{
    parentRetrievalId: string;
    parentRetrievalName: string;
    retrievalsCount: number;
    itemsCount: number;
  }> {
    try {
      // Fetch AgodaCaseItems with details
      const items = await this.repository.findItemsWithDetailsForRetrieval(ids);

      if (items.length === 0) {
        throw new NotFoundException('No AgodaCaseItems found with provided IDs');
      }

      // Generate parent retrieval name
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const parentRetrievalName = `agoda-retrieval-wip-automatic-${dateStr}`;

      // Create Parent Retrieval
      const parentRetrieval = await this.retrievalService.createParentRetrieval({
        name: parentRetrievalName,
        ota_provider: 'Agoda',
      });

      this.logger.log(
        `Created ParentRetrieval: ${parentRetrieval.id} - ${parentRetrieval.name}`,
      );

      // Group items by property_id
      const itemsByProperty = items.reduce((acc, item) => {
        const propertyId = item.property_id;
        if (!acc[propertyId]) {
          acc[propertyId] = [];
        }
        acc[propertyId].push(item);
        return acc;
      }, {} as Record<string, typeof items>);

      const retrievalsCreated: string[] = [];

      // Create one Retrieval per property
      for (const propertyId of Object.keys(itemsByProperty)) {
        const propertyItems = itemsByProperty[propertyId];
        const firstItem = propertyItems[0];
        const property = firstItem.property;
        const posting_type = firstItem.posting_type || 'pre';

        // Create Retrieval
        const retrieval = await this.retrievalService.createRetrieval({
          name: `${property.name} - ${parentRetrievalName}`,
          user_id: userId,
          parent_retrieval_id: parentRetrieval.id,
          property_id: propertyId,
          property_name: property.name,
          portfolio_id: property.portfolio_id || undefined,
          portfolio_name: firstItem.portfolio?.name || undefined,
          batch_id: firstItem.batch_id || undefined,
          posting_type: posting_type as PostingType,
          ota_provider: 'Agoda',
          remaining_direct_billed: 0,
          total_collectable: 0,
          total_amount_confirmed: 0,
          execution_type: 'automatic',
          job_backoff_length_loading: 5000,
          job_backoff_length_selector: 3000,
        });

        retrievalsCreated.push(retrieval.id);

        // Update AgodaCaseItems with retrieval_id
        const itemIds = propertyItems.map((item) => item.id);
        await this.repository.updateRetrievalIdForItems(itemIds, retrieval.id);

        this.logger.log(
          `Created Retrieval: ${retrieval.id} for property ${property.name} with ${itemIds.length} items`,
        );
      }

      this.logger.log(
        `Send to Retrieval completed: ${retrievalsCreated.length} retrieval(s) created from ${items.length} item(s)`,
      );

      return {
        parentRetrievalId: parentRetrieval.id,
        parentRetrievalName: parentRetrieval.name,
        retrievalsCount: retrievalsCreated.length,
        itemsCount: items.length,
      };
    } catch (error) {
      this.logger.error('Error sending to retrieval:', error);
      throw error;
    }
  }
}
