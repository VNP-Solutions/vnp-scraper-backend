import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  OTAProvider,
  ParentRetrieval,
  PostingType,
  Retrieval,
  RetrievalItem,
} from '@prisma/client';
import * as XLSX from 'xlsx';
import { IPropertyRepository } from '../property/property.interface';
import {
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

      const parentRetrievalName = `Retrieval ${new Date().toISOString().split('T')[0]}`;
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

      this.logger.log(
        `Processing ${groupedByHotelId.size} unique hotels from Excel file`,
      );

      for (const [hotelId, rows] of groupedByHotelId) {
        try {
          const firstRow = rows[0];

          this.logger.log(
            `Processing Hotel ID: ${hotelId}, Rows: ${rows.length}`,
          );

          let property = await this.propertyRepository.findByExpediaId(
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

            // Create property
            const propertyData = {
              name: firstRow['Hotel Name'] || `Hotel ${hotelId}`,
              portfolio_id: portfolio.id,
              expedia_id: parseInt(hotelId),
              expedia_status: 'Active',
            };

            property = await this.propertyRepository.create(propertyData);
            createdPropertiesCount++;
            this.logger.log(
              `Created new property: ${property.id} - ${property.name} (Hotel ID: ${hotelId})`,
            );
          }

          const reservationIds = rows
            .map((r) => r['Reservation ID']?.toString())
            .filter((id) => id && id.trim() !== '');

          const retrievalData: CreateRetrievalDto = {
            name: firstRow['Hotel Name'] || property.name || 'Unknown',
            parent_retrieval_id: parentRetrieval.id,
            user_id: userId,
            property_id: property.id,
            property_name: firstRow['Hotel Name'] || property.name || 'Unknown',
            portfolio_name: firstRow['Portfolio'] || 'Unknown',
            posting_type: this.convertToPostingType(firstRow['Posting Type']),
            ota_provider: OTAProvider.Expedia,
            execution_type: 'retrieval',
            remaining_direct_billed: 0,
            total_collectable: 0,
            total_amount_confirmed: 0,
            job_backoff_length_loading: 5000,
            job_backoff_length_selector: 3000,
            reservations: reservationIds,
          };

          const retrieval = await this.createRetrieval(retrievalData);
          this.logger.log(
            `Created Retrieval: ${retrieval.id} for Hotel ID: ${hotelId}`,
          );
          retrievals.push(retrieval);
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
        `Processing completed: 1 Parent Retrieval, ${successCount} Retrievals (Success), ${failedCount} Retrievals (Failed), ${createdPortfoliosCount} Portfolios Created, ${createdPropertiesCount} Properties Created`,
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
      };
    } catch (error) {
      this.logger.error(
        `Error uploading retrieval excel: ${error.message}`,
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
}
