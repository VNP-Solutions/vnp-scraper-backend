import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  Batch,
  OTAProvider,
  ParentRetrieval,
  PostingType,
  Retrieval,
  RetrievalItem,
} from '@prisma/client';
import * as XLSX from 'xlsx';
import { IPropertyCredentialsService } from '../property-credentials/property-credentials.interface';
import {
  IPropertyRepository,
  IPropertyService,
} from '../property/property.interface';
import {
  CreateBatchDto,
  CreateParentRetrievalDto,
  CreateRetrievalDto,
  CreateRetrievalItemDto,
  UpdateRetrievalDto,
} from './retrieval.dto';
import { IRetrievalRepository, IRetrievalService } from './retrieval.interface';

@Injectable()
export class RetrievalService implements IRetrievalService {
  constructor(
    @Inject('IRetrievalRepository')
    private readonly repository: IRetrievalRepository,
    @Inject('IPropertyRepository')
    private readonly propertyRepository: IPropertyRepository,
    @Inject('IPropertyService')
    private readonly propertyService: IPropertyService,
    @Inject('IPropertyCredentialsService')
    private readonly propertyCredentialsService: IPropertyCredentialsService,
    private readonly logger: Logger,
  ) {}

  private convertToPostingType(value: string): PostingType {
    if (!value) return PostingType.OTA;

    const normalizedValue = value.trim().toUpperCase();
    switch (normalizedValue) {
      case 'OTA':
        return PostingType.OTA;
      case 'OTA Post':
      case 'OTA_PLUS':
      case 'OTA PLUS':
        return PostingType.OTA_PLUS;
      default:
        return PostingType.OTA;
    }
  }

  private convertToOTAProvider(value: string): OTAProvider {
    if (!value) return OTAProvider.Expedia;

    const normalizedValue = value.trim();
    switch (normalizedValue) {
      case 'Expedia':
        return OTAProvider.Expedia;
      case 'Booking':
        return OTAProvider.Booking;
      case 'Agoda':
        return OTAProvider.Agoda;
      default:
        return OTAProvider.Expedia;
    }
  }

  private parseExcelDate(value: any): Date {
    if (!value) return new Date();

    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'number') {
      const date = XLSX.SSF.parse_date_code(value);
      return new Date(date.y, date.m - 1, date.d);
    }

    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return new Date();
  }

  async uploadRetrievalExcel(
    file: Express.Multer.File,
    userId: string,
  ): Promise<{
    parentRetrieval: ParentRetrieval;
    retrievals: Retrieval[];
    successCount: number;
    failedCount: number;
    failedHotelIds: string[];
    retrievalItemsCount: number;
  }> {
    try {
      if (!file) {
        throw new BadRequestException('No file uploaded');
      }

      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);

      if (!rawData || rawData.length === 0) {
        throw new BadRequestException('Excel file is empty');
      }

      const parentRetrievalName = file.originalname;
      const parentRetrieval = await this.createParentRetrieval({
        name: parentRetrievalName,
      });

      const groupedByHotelId = new Map<string, any[]>();

      for (const row of rawData) {
        const hotelId = row['Hotel ID']?.toString() || '';
        if (!hotelId) continue;

        if (!groupedByHotelId.has(hotelId)) {
          groupedByHotelId.set(hotelId, []);
        }
        groupedByHotelId.get(hotelId)!.push(row);
      }

      const retrievals: Retrieval[] = [];
      let successCount = 0;
      let failedCount = 0;
      const failedHotelIds: string[] = [];
      let createdPropertiesCount = 0;
      let createdPortfoliosCount = 0;
      let retrievalItemsCount = 0;

      this.logger.log(
        `Processing ${groupedByHotelId.size} unique hotels from Excel file`,
      );

      for (const [hotelId, rows] of groupedByHotelId) {
        try {
          const firstRow = rows[0];

          this.logger.log(
            `Processing Hotel ID: ${hotelId}, Rows: ${rows.length}`,
          );

          // Determine OTA provider for this group
          const rawProvider =
            (
              firstRow['OTA Provider'] ||
              firstRow['Provider'] ||
              firstRow['OTA'] ||
              ''
            )?.toString() || '';
          const otaProvider =
            rawProvider && rawProvider.trim() !== ''
              ? this.convertToOTAProvider(rawProvider)
              : firstRow['Agoda ID'] ||
                  firstRow['Agoda Username'] ||
                  firstRow['Agoda Password']
                ? OTAProvider.Agoda
                : OTAProvider.Expedia;

          // Find property based on OTA provider
          let property =
            otaProvider === OTAProvider.Agoda
              ? await this.propertyRepository.findByAgodaId(parseInt(hotelId))
              : await this.propertyRepository.findByExpediaId(
                  parseInt(hotelId),
                );

          if (!property) {
            this.logger.warn(
              `Property not found for Hotel ID: ${hotelId} (${firstRow['Hotel Name'] || 'Unknown'}). Creating new property...`,
            );

            // Create or find portfolio
            const portfolioName = firstRow['Portfolio'] || 'Unknown Portfolio';
            let portfolio =
              await this.propertyRepository.findPortfolioByName(portfolioName);

            if (!portfolio) {
              this.logger.log(
                `Portfolio "${portfolioName}" not found. Creating new portfolio...`,
              );
              portfolio =
                await this.propertyRepository.createPortfolio(portfolioName);
              createdPortfoliosCount++;
              this.logger.log(
                `Created new portfolio: ${portfolio.id} - ${portfolioName}`,
              );
            }

            // Create property using service (handles business logic)
            const propertyData = {
              name:
                firstRow['Hotel Name'] ||
                firstRow['Property Name'] ||
                `Hotel ${hotelId}`,
              portfolio_id: portfolio.id,
              ...(otaProvider === OTAProvider.Agoda
                ? {
                    agoda_id: parseInt(hotelId),
                    agoda_status: 'Active',
                  }
                : {
                    expedia_id: parseInt(hotelId),
                    expedia_status: 'Active',
                  }),
            };

            property = await this.propertyService.createProperty(propertyData);
            createdPropertiesCount++;
            this.logger.log(
              `Created new property: ${property.id} - ${property.name} (Hotel ID: ${hotelId})`,
            );

            // Create property credentials if username and password are provided
            const username = (firstRow['User Name'] || firstRow['Username'])
              ?.toString()
              ?.trim();
            const password = (firstRow['Password'] || firstRow['Password'])
              ?.toString()
              ?.trim();

            if (username || password) {
              try {
                const credentialsData: any = {
                  property_id: property.id,
                };

                if (otaProvider === OTAProvider.Agoda) {
                  credentialsData.agodaUsername = username || '';
                  credentialsData.agodaPassword = password || '';
                } else {
                  credentialsData.expediaUsername = username || '';
                  credentialsData.expediaPassword = password || '';
                }

                await this.propertyCredentialsService.createPropertyCredentials(
                  credentialsData,
                );

                this.logger.log(
                  `Created property credentials for property: ${property.id}`,
                );
              } catch (credError) {
                this.logger.error(
                  `Failed to create credentials for property ${property.id}: ${credError.message}`,
                );
                // Don't fail the entire process if credentials creation fails
              }
            }
          } else {
            // Update property credential with new username and password
            const username = (firstRow['User Name'] || firstRow['Username'])
              ?.toString()
              ?.trim();
            const password = firstRow['Password']?.toString()?.trim();

            if (username || password) {
              try {
                const existingCredentials =
                  await this.propertyCredentialsService.getPropertyCredentialsByPropertyId(
                    property.id,
                  );

                if (existingCredentials) {
                  const credentialsUpdateData: any = {};

                  if (otaProvider === OTAProvider.Agoda) {
                    credentialsUpdateData.agodaUsername = username || '';
                    credentialsUpdateData.agodaPassword = password || '';
                  } else {
                    credentialsUpdateData.expediaUsername = username || '';
                    credentialsUpdateData.expediaPassword = password || '';
                  }

                  await this.propertyCredentialsService.updatePropertyCredentials(
                    existingCredentials.id,
                    credentialsUpdateData,
                  );

                  this.logger.log(
                    `Updated property credentials for property: ${property.id}`,
                  );
                } else {
                  const credentialsData: any = {
                    property_id: property.id,
                  };

                  if (otaProvider === OTAProvider.Agoda) {
                    credentialsData.agodaUsername = username || '';
                    credentialsData.agodaPassword = password || '';
                  } else {
                    credentialsData.expediaUsername = username || '';
                    credentialsData.expediaPassword = password || '';
                  }

                  await this.propertyCredentialsService.createPropertyCredentials(
                    credentialsData,
                  );

                  this.logger.log(
                    `Created property credentials for property: ${property.id}`,
                  );
                }
              } catch (credError) {
                this.logger.error(
                  `Failed to update credentials for property ${property.id}: ${credError.message}`,
                );
                // Don't fail the entire process if credentials update fails
              }
            }
          }

          const reservationIds = rows
            .map((r) => r['Reservation ID']?.toString())
            .filter((id) => id && id.trim() !== '');

          // Handle Batch - create if doesn't exist (optional field)
          let batchId = null;
          const batchColumn =
            firstRow['Batch Name'] ||
            firstRow['Batch'] ||
            firstRow['Batch name'];
          if (batchColumn && batchColumn.trim() !== '') {
            const batchName = batchColumn.toString().trim();

            // Try to find existing batch by name
            let existingBatch = await this.findBatchByName(batchName);

            if (existingBatch) {
              batchId = existingBatch.id;
              this.logger.log(
                `Using existing batch: ${batchName} (${batchId})`,
              );
            } else {
              // Create new batch if it doesn't exist
              const newBatch = await this.createBatch({ name: batchName });
              batchId = newBatch.id;
              this.logger.log(`Created new batch: ${batchName} (${batchId})`);
            }
          }

          const retrievalData: CreateRetrievalDto = {
            name: firstRow['Hotel Name'] || property.name || 'Unknown',
            parent_retrieval_id: parentRetrieval.id,
            user_id: userId,
            property_id: property.id,
            property_name: firstRow['Hotel Name'] || property.name || 'Unknown',
            portfolio_name: firstRow['Portfolio'] || 'Unknown',
            posting_type: this.convertToPostingType(firstRow['Posting Type']),
            ota_provider: otaProvider,
            execution_type: 'retrieval',
            remaining_direct_billed: 0,
            total_collectable: 0,
            total_amount_confirmed: 0,
            job_backoff_length_loading: 5000,
            job_backoff_length_selector: 3000,
            reservations: reservationIds,
            batch_id: batchId,
          };

          const retrieval = await this.createRetrieval(retrievalData);
          this.logger.log(
            `Created Retrieval: ${retrieval.id} for Hotel ID: ${hotelId}`,
          );
          retrievals.push(retrieval);

          // Create RetrievalItems for each row (Agoda only)
          if (otaProvider === OTAProvider.Agoda) {
            const retrievalItems: CreateRetrievalItemDto[] = [];

            for (const row of rows) {
              const checkInDate = this.parseExcelDate(row['From (MM/DD/YYYY)']);
              const checkOutDate = this.parseExcelDate(row['To (MM/DD/YYYY)']);

              if (!checkInDate || !checkOutDate) {
                continue;
              }

              const guestName =
                row['Name']?.toString() ||
                row['Customer Name']?.toString() ||
                'Unknown';

              const amountRaw = row['Amount to Charge or Refund'];
              const amount =
                amountRaw !== undefined &&
                amountRaw !== null &&
                amountRaw !== ''
                  ? parseFloat(amountRaw)
                  : null;

              const cardNumber = row['Card Number']
                ? row['Card Number'].toString()
                : null;
              const expiryCode = row['Expiry Code']
                ? row['Expiry Code'].toString()
                : null;
              const cvcCode = row['CVC Code']
                ? row['CVC Code'].toString()
                : null;

              const hasCardInfo = !!(cardNumber || expiryCode || cvcCode);

              const retrievalItemData: CreateRetrievalItemDto = {
                retrieval_id: retrieval.id,
                parent_retrieval_id: parentRetrieval.id,
                property_id: property.id,
                guest_name: guestName,
                reservation_id: undefined,
                confirmation_number: undefined,
                check_in_date: checkInDate,
                check_out_date: checkOutDate,
                room_type: 'Standard',
                booking_amount: amount ?? undefined,
                booked_date: new Date(),
                has_card_info: hasCardInfo,
                card_info: hasCardInfo
                  ? {
                      card_number: cardNumber || '',
                      expiry_date: expiryCode || '',
                      cvv: cvcCode || undefined,
                    }
                  : undefined,
                has_payment_info: amount !== null,
                payment_info:
                  amount !== null
                    ? {
                        amount_to_charge_or_refund: amount,
                      }
                    : undefined,
                reservation_status: 'Pending',
                additional_text: undefined,
              };

              retrievalItems.push(retrievalItemData);
            }

            if (retrievalItems.length > 0) {
              await this.repository.createManyRetrievalItems(retrievalItems);
              retrievalItemsCount += retrievalItems.length;
              this.logger.log(
                `Created ${retrievalItems.length} RetrievalItems for Retrieval (Agoda): ${retrieval.id}`,
              );
            }
          }

          // Create RetrievalItems for each row
          // const retrievalItems: CreateRetrievalItemDto[] = [];
          // for (const row of rows) {
          //   const reservationId = row['Reservation ID']?.toString();
          //   const checkInDate = this.parseExcelDate(row['Check In']);
          //   const checkOutDate = this.parseExcelDate(row['Check Out']);

          //   if (reservationId && checkInDate && checkOutDate) {
          //     const retrievalItemData: CreateRetrievalItemDto = {
          //       retrieval_id: retrieval.id,
          //       parent_retrieval_id: parentRetrieval.id,
          //       property_id: property.id,
          //       guest_name: row['Name']?.toString() || 'Unknown',
          //       reservation_id: reservationId,
          //       confirmation_number:
          //         row['Hotel Confirmation Code']?.toString() || null,
          //       check_in_date: checkInDate,
          //       check_out_date: checkOutDate,
          //       room_type: 'Standard',
          //       booking_amount: parseFloat(row['Amount to charge']) || 0,
          //       booked_date: new Date(),
          //       has_card_info: !!(
          //         row['Card first 4'] ||
          //         row['Card last 12'] ||
          //         row['Card Expire'] ||
          //         row['Card CVV']
          //       ),
          //       card_info:
          //         row['Card first 4'] ||
          //         row['Card last 12'] ||
          //         row['Card Expire'] ||
          //         row['Card CVV']
          //           ? {
          //               card_number: `${row['Card first 4']}****${row['Card last 12']}`,
          //               cvv: row['Card CVV']?.toString() || null,
          //               expiry_date: row['Card Expire']?.toString() || null,
          //             }
          //           : null,
          //       has_payment_info: false,
          //       payment_info: null,
          //       reservation_status:
          //         row['Charge status']?.toString() || 'Pending',
          //       additional_text: row['isMissing']?.toString() || null,
          //     };

          //     retrievalItems.push(retrievalItemData);
          //   }
          // }

          // if (retrievalItems.length > 0) {
          //   await this.repository.createManyRetrievalItems(retrievalItems);
          //   retrievalItemsCount += retrievalItems.length;
          //   this.logger.log(
          //     `Created ${retrievalItems.length} RetrievalItems for Retrieval: ${retrieval.id}`,
          //   );
          // }

          successCount++;
        } catch (error) {
          this.logger.error(
            `Error processing Hotel ID: ${hotelId} - ${error.message}`,
            error.stack,
          );
          failedCount++;
          failedHotelIds.push(hotelId);
        }
      }

      this.logger.log(
        `Processing completed: 1 Parent Retrieval, ${successCount} Retrievals (Success), ${failedCount} Retrievals (Failed), ${retrievalItemsCount} Retrieval Items, ${createdPortfoliosCount} Portfolios Created, ${createdPropertiesCount} Properties Created`,
      );

      if (failedHotelIds.length > 0) {
        this.logger.warn(`Failed Hotel IDs: ${failedHotelIds.join(', ')}`);
      }

      return {
        parentRetrieval,
        retrievals,
        successCount,
        failedCount,
        failedHotelIds,
        retrievalItemsCount,
      };
    } catch (error) {
      this.logger.error(
        `Error uploading retrieval excel: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async exportRetrievalItemsToExcel(
    parentRetrievalId: string,
  ): Promise<Buffer> {
    try {
      // Get parent retrieval
      const parentRetrieval =
        await this.repository.findParentRetrievalById(parentRetrievalId);
      if (!parentRetrieval) {
        throw new BadRequestException('Parent retrieval not found');
      }

      // Get all retrieval items for this parent retrieval
      const retrievalItems =
        await this.repository.findRetrievalItemsByParentRetrievalId(
          parentRetrievalId,
        );

      if (retrievalItems.length === 0) {
        throw new BadRequestException(
          'No retrieval items found for this parent retrieval',
        );
      }

      // Get property details for each item
      const excelData = [];
      for (const item of retrievalItems) {
        const property: any = await this.propertyRepository.findById(
          item.property_id,
        );
        const retrieval: any = (item as any).retrieval;

        // Fetch batch name if batch_id exists
        let batchName = '';
        if (retrieval?.batch_id) {
          const batch = await this.repository.findBatchById(retrieval.batch_id);
          batchName = batch?.name || '';
        }

        // Fetch credentials and decrypt password
        const credentials =
          await this.propertyCredentialsService.getPropertyCredentialsByPropertyId(
            item.property_id,
          );

        let username = '';
        let password = '';
        if (credentials) {
          username = credentials.expediaUsername || '';
          password = credentials.expediaPassword
            ? this.propertyCredentialsService.decryptPassword(
                credentials.expediaPassword,
              )
            : '';
        }

        const row = {
          'Hotel ID': property?.expedia_id || '',
          Batch: batchName,
          'Posting Type': retrieval?.posting_type || '',
          Portfolio: retrieval?.portfolio_name || '',
          'Hotel Name': property?.name || '',
          'Reservation ID': item.reservation_id || '',
          'Hotel Confirmation Code': item.confirmation_number || '',
          Name: item.guest_name || '',
          'Check In': item.check_in_date
            ? new Date(item.check_in_date).toLocaleDateString()
            : '',
          'Check Out': item.check_out_date
            ? new Date(item.check_out_date).toLocaleDateString()
            : '',
          Currency: 'USD',
          'Amount to charge':
            item.payment_info?.amount_to_charge_or_refund || 0,
          'Charge status': item.reservation_status || '',
          'Card first 4': item.card_info?.card_number?.slice(0, 4) || '',
          'Card last 12': item.card_info?.card_number?.slice(-12) || '',
          'Card Expire': item.card_info?.expiry_date || '',
          'Card CVV': item.card_info?.cvv || '',
          'User Name': username,
          Password: password,
          isMissing: item.additional_text || 'Present',
        };

        excelData.push(row);
      }

      // Create Excel workbook
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Retrieval Items');

      // Generate buffer
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return buffer;
    } catch (error) {
      this.logger.error(
        `Error exporting retrieval items to Excel: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async createParentRetrieval(
    data: CreateParentRetrievalDto,
  ): Promise<ParentRetrieval> {
    try {
      return await this.repository.createParentRetrieval(data);
    } catch (error) {
      this.logger.error(
        `Error creating parent retrieval: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAllParentRetrievals(
    query: Record<string, any>,
  ): Promise<{ data: ParentRetrieval[]; metadata: any }> {
    try {
      return await this.repository.findAllParentRetrievals(query);
    } catch (error) {
      this.logger.error(
        `Error getting all parent retrievals: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async createRetrieval(data: CreateRetrievalDto): Promise<Retrieval> {
    try {
      return await this.repository.createRetrieval(data);
    } catch (error) {
      this.logger.error(
        `Error creating retrieval: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async createRetrievalItem(
    data: CreateRetrievalItemDto,
  ): Promise<RetrievalItem> {
    try {
      return await this.repository.createRetrievalItem(data);
    } catch (error) {
      this.logger.error(
        `Error creating retrieval item: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAllRetrievals(
    query: Record<string, any>,
  ): Promise<{ data: Retrieval[]; metadata: any }> {
    try {
      return await this.repository.findAllRetrievals(query);
    } catch (error) {
      this.logger.error(
        `Error getting retrievals: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getRetrievalById(id: string): Promise<Retrieval> {
    try {
      const retrieval = await this.repository.findRetrievalById(id);
      if (!retrieval) {
        throw new Error(`Retrieval with ID ${id} not found`);
      }
      return retrieval;
    } catch (error) {
      this.logger.error(
        `Error finding retrieval: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getRetrievalsByParentRetrievalId(
    parentRetrievalId: string,
    query: Record<string, any>,
  ): Promise<{ data: Retrieval[]; metadata: any }> {
    try {
      return await this.repository.findRetrievalsByParentRetrievalId(
        parentRetrievalId,
        query,
      );
    } catch (error) {
      this.logger.error(
        `Error getting retrievals by parent retrieval ID: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getParentRetrievalById(id: string): Promise<ParentRetrieval> {
    try {
      const parentRetrieval = await this.repository.findParentRetrievalById(id);
      if (!parentRetrieval) {
        throw new Error(`Parent retrieval with ID ${id} not found`);
      }
      return parentRetrieval;
    } catch (error) {
      this.logger.error(
        `Error finding parent retrieval: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getRetrievalItemsByRetrievalId(
    retrievalId: string,
    query: Record<string, any>,
  ): Promise<{ data: RetrievalItem[]; metadata: any }> {
    try {
      return await this.repository.findRetrievalItemsByRetrievalId(
        retrievalId,
        query,
      );
    } catch (error) {
      this.logger.error(
        `Error getting retrieval items by retrieval ID: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateRetrieval(
    id: string,
    data: UpdateRetrievalDto,
  ): Promise<Retrieval> {
    try {
      return await this.repository.updateRetrieval(id, data);
    } catch (error) {
      this.logger.error(
        `Error updating retrieval: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async deleteRetrieval(id: string): Promise<void> {
    try {
      await this.repository.deleteRetrieval(id);
    } catch (error) {
      this.logger.error(
        `Error deleting retrieval: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async deleteParentRetrieval(id: string): Promise<void> {
    try {
      await this.repository.deleteParentRetrieval(id);
    } catch (error) {
      this.logger.error(
        `Error deleting parent retrieval: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async createBatch(data: CreateBatchDto): Promise<Batch> {
    try {
      const batch = await this.repository.createBatch(data);
      return batch;
    } catch (error) {
      this.logger.error(`Error creating batch: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findBatchByName(name: string): Promise<Batch | null> {
    try {
      const batch = await this.repository.findBatchByName(name);
      return batch;
    } catch (error) {
      this.logger.error(
        `Error finding batch by name: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async bulkBatchUpdate(
    retrievalIds: string[],
    batchId: string,
  ): Promise<{ updatedCount: number; batch_id: string }> {
    try {
      if (!retrievalIds || retrievalIds.length === 0) {
        throw new Error('retrieval_ids array cannot be empty');
      }

      if (!batchId) {
        throw new Error('batch_id is required');
      }

      const result = await this.repository.bulkBatchUpdate(
        retrievalIds,
        batchId,
      );
      return {
        updatedCount: result.count,
        batch_id: batchId,
      };
    } catch (error) {
      this.logger.error(
        `Error bulk updating retrievals batch: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
