import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AgodaCaseItem } from '@prisma/client';
import * as XLSX from 'xlsx';
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
}
