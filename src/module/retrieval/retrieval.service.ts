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
  Property,
  Retrieval,
  RetrievalItem,
} from '@prisma/client';
import * as XLSX from 'xlsx';
import { applyExcelTextColumnFormat } from '../../common/utils/excel-text-column.util';
import {
  ensureUniqueFilename,
  formatDateForFilename,
  sanitizeForFilename,
} from '../../common/utils/zip-and-filename.util';
import { IPropertyCredentialsService } from '../property-credentials/property-credentials.interface';
import {
  IPropertyRepository,
  IPropertyService,
} from '../property/property.interface';
import { IRecurringJobService } from '../recurring-job/recurring-job.interface';
import {
  BulkCreateRetrievalsFromDbmsDto,
  BulkCreateRetrievalsFromDbmsResultDto,
  CreateBatchDto,
  CreateParentRetrievalDto,
  CreateRetrievalDto,
  CreateRetrievalItemDto,
  UpdateParentRetrievalDto,
  UpdateRetrievalDto,
} from './retrieval.dto';
import { IRetrievalRepository, IRetrievalService } from './retrieval.interface';

const RETRIEVAL_EXPORT_CVV_COLUMN = 'Card CVV';

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
    @Inject('IRecurringJobService')
    private readonly recurringJobService: IRecurringJobService,
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

    const normalizedValue = value.trim().toLowerCase();
    switch (normalizedValue) {
      case 'expedia':
        return OTAProvider.Expedia;
      case 'booking':
        return OTAProvider.Booking;
      case 'agoda':
        return OTAProvider.Agoda;
      default:
        return OTAProvider.Expedia;
    }
  }

  private resolveOtaProviderFromRow(firstRow: Record<string, unknown>): OTAProvider {
    const rawProvider =
      (
        firstRow['OTA Provider'] ||
        firstRow['Provider'] ||
        firstRow['OTA'] ||
        ''
      )?.toString() || '';

    if (rawProvider.trim() !== '') {
      return this.convertToOTAProvider(rawProvider);
    }

    if (
      firstRow['Agoda ID'] ||
      firstRow['Agoda Username'] ||
      firstRow['Agoda Password']
    ) {
      return OTAProvider.Agoda;
    }

    return OTAProvider.Expedia;
  }

  private buildOtaIdFields(
    otaProvider: OTAProvider,
    hotelIdNum: number,
  ): Record<string, string | number> {
    switch (otaProvider) {
      case OTAProvider.Agoda:
        return { agoda_id: hotelIdNum, agoda_status: 'Active' };
      case OTAProvider.Booking:
        return { booking_id: hotelIdNum, booking_status: 'Active' };
      default:
        return { expedia_id: hotelIdNum, expedia_status: 'Active' };
    }
  }

  private async ensurePropertyHasOtaId(
    property: Property,
    otaProvider: OTAProvider,
    hotelIdNum: number,
  ): Promise<Property> {
    const needsAgoda =
      otaProvider === OTAProvider.Agoda && property.agoda_id == null;
    const needsExpedia =
      otaProvider === OTAProvider.Expedia && property.expedia_id == null;
    const needsBooking =
      otaProvider === OTAProvider.Booking && property.booking_id == null;

    if (!needsAgoda && !needsExpedia && !needsBooking) {
      return property;
    }

    return this.propertyRepository.update(
      property.id,
      this.buildOtaIdFields(otaProvider, hotelIdNum),
    );
  }

  private async upsertRetrievalPropertyCredentials(
    property: { id: string },
    otaProvider: OTAProvider,
    firstRow: Record<string, unknown>,
  ): Promise<void> {
    const username = (firstRow['User Name'] || firstRow['Username'])
      ?.toString()
      ?.trim();
    const password = firstRow['Password']?.toString()?.trim();

    if (!username && !password) {
      return;
    }

    const credentialsData: Record<string, string> =
      otaProvider === OTAProvider.Agoda
        ? {
            agodaUsername: username || '',
            agodaPassword: password || '',
          }
        : otaProvider === OTAProvider.Booking
          ? {
              bookingUsername: username || '',
              bookingPassword: password || '',
            }
          : {
              expediaUsername: username || '',
              expediaPassword: password || '',
            };

    try {
      const existingCredentials =
        await this.propertyCredentialsService.getPropertyCredentialsByPropertyId(
          property.id,
        );

      if (existingCredentials) {
        await this.propertyCredentialsService.updatePropertyCredentials(
          existingCredentials.id,
          credentialsData,
        );
      } else {
        await this.propertyCredentialsService.createPropertyCredentials({
          property_id: property.id,
          ...credentialsData,
        });
      }
    } catch (credError: any) {
      this.logger.error(
        `Failed to upsert credentials for property ${property.id}: ${credError.message}`,
      );
    }
  }

  private isPrismaUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
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

      const groupedByHotelId = this.parseExcelBuffer(file.buffer);

      if (!groupedByHotelId.size) {
        throw new BadRequestException(
          'Excel file is empty or has no valid Hotel IDs',
        );
      }

      const result = await this.importRetrievalGroups(
        file.originalname,
        groupedByHotelId,
        userId,
      );

      return {
        parentRetrieval: result.parentRetrieval,
        retrievals: result.retrievals,
        successCount: result.successCount,
        failedCount: result.failedCount,
        failedHotelIds: result.failedHotelIds,
        retrievalItemsCount: result.retrievalItemsCount,
      };
    } catch (error) {
      this.logger.error(
        `Error uploading retrieval excel: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * DBMS→scraper sync receiver. Creates parent retrieval and per-hotel
   * retrievals from grouped Excel rows. Per-row reporting: one failing row
   * does not abort the batch.
   */
  async bulkCreateFromDbms(
    dto: BulkCreateRetrievalsFromDbmsDto,
  ): Promise<BulkCreateRetrievalsFromDbmsResultDto> {
    if (!dto?.groups?.length) {
      throw new BadRequestException('No retrieval groups provided');
    }

    const groupedByHotelId = new Map<string, any[]>();
    for (const group of dto.groups) {
      const hotelId = (group.hotel_id ?? '').toString().trim();
      if (!hotelId) continue;
      groupedByHotelId.set(hotelId, group.rows ?? []);
    }

    if (!groupedByHotelId.size) {
      throw new BadRequestException('No valid hotel groups provided');
    }

    const userId = await this.recurringJobService.resolveDbmsSystemUser();
    const result = await this.importRetrievalGroups(
      dto.parent_retrieval_name || 'DBMS Retrieval Import',
      groupedByHotelId,
      userId,
    );

    return {
      totalCount: groupedByHotelId.size,
      successCount: result.successCount,
      failedCount: result.failedCount,
      retrievalItemsCount: result.retrievalItemsCount,
      parent_retrieval_id: result.parentRetrieval.id,
      errors: result.errors,
      failed_hotel_ids: result.failedHotelIds,
      created: result.created,
    };
  }

  private parseExcelBuffer(buffer: Buffer): Map<string, any[]> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);
    return this.groupRetrievalExcelRows(rawData);
  }

  private groupRetrievalExcelRows(rawData: any[]): Map<string, any[]> {
    const groupedByHotelId = new Map<string, any[]>();

    for (const row of rawData) {
      const hotelId =
        (
          row['Hotel ID'] ||
          row['Property ID'] ||
          row['Property Id']
        )?.toString() || '';
      if (!hotelId) continue;

      if (!groupedByHotelId.has(hotelId)) {
        groupedByHotelId.set(hotelId, []);
      }
      groupedByHotelId.get(hotelId)!.push(row);
    }

    return groupedByHotelId;
  }

  private async importRetrievalGroups(
    parentRetrievalName: string,
    groupedByHotelId: Map<string, any[]>,
    userId: string,
  ): Promise<{
    parentRetrieval: ParentRetrieval;
    retrievals: Retrieval[];
    successCount: number;
    failedCount: number;
    failedHotelIds: string[];
    retrievalItemsCount: number;
    errors: Array<{ hotel_id: string; name?: string; error: string }>;
    created: Array<{ hotel_id: string; retrieval_id: string }>;
  }> {
    const parentRetrieval = await this.repository.createParentRetrieval({
      name: parentRetrievalName,
    });

    const retrievals: Retrieval[] = [];
    let successCount = 0;
    let failedCount = 0;
    const failedHotelIds: string[] = [];
    const errors: Array<{ hotel_id: string; name?: string; error: string }> =
      [];
    const created: Array<{ hotel_id: string; retrieval_id: string }> = [];
    let createdPropertiesCount = 0;
    let createdPortfoliosCount = 0;
    let retrievalItemsCount = 0;
    let firstOtaProvider: OTAProvider | null = null;

    this.logger.log(
      `Processing ${groupedByHotelId.size} unique hotels for retrieval import`,
    );

    for (const [hotelId, rows] of groupedByHotelId) {
      const firstRow = rows[0];
      const hotelName =
        firstRow?.['Hotel Name']?.toString() ||
        firstRow?.['Property Name']?.toString() ||
        undefined;

      try {
        this.logger.log(
          `Processing Hotel ID: ${hotelId}, Rows: ${rows.length}`,
        );

        const otaProvider = this.resolveOtaProviderFromRow(firstRow);

        const hotelIdNum = parseInt(hotelId, 10);
        if (!Number.isFinite(hotelIdNum)) {
          throw new BadRequestException(`Invalid Hotel ID: ${hotelId}`);
        }

        let property = await this.propertyRepository.findByOtaIds({
          expedia_id: hotelIdNum,
          booking_id: hotelIdNum,
          agoda_id: hotelIdNum,
        });

        if (property) {
          property = await this.ensurePropertyHasOtaId(
            property,
            otaProvider,
            hotelIdNum,
          );
          await this.upsertRetrievalPropertyCredentials(
            property,
            otaProvider,
            firstRow,
          );
        } else {
          const portfolioName = firstRow['Portfolio'] || 'Unknown Portfolio';
          let portfolio =
            await this.propertyRepository.findPortfolioByName(portfolioName);

          if (!portfolio) {
            portfolio =
              await this.propertyRepository.createPortfolio(portfolioName);
            createdPortfoliosCount++;
          }

          const propertyData = {
            name:
              firstRow['Hotel Name'] ||
              firstRow['Property Name'] ||
              `Hotel ${hotelId}`,
            portfolio_id: portfolio.id,
            ...this.buildOtaIdFields(otaProvider, hotelIdNum),
          };

          try {
            property = await this.propertyService.createProperty(propertyData);
            createdPropertiesCount++;
          } catch (createError) {
            if (this.isPrismaUniqueConstraintError(createError)) {
              property = await this.propertyRepository.findByOtaIds({
                expedia_id: hotelIdNum,
                booking_id: hotelIdNum,
                agoda_id: hotelIdNum,
              });
              if (!property) {
                throw createError;
              }
              property = await this.ensurePropertyHasOtaId(
                property,
                otaProvider,
                hotelIdNum,
              );
            } else {
              throw createError;
            }
          }

          await this.upsertRetrievalPropertyCredentials(
            property,
            otaProvider,
            firstRow,
          );
        }

        const reservationIds = rows
          .map((r) => r['Reservation ID']?.toString())
          .filter((id) => id && id.trim() !== '');

        let batchId = null;
        const batchColumn =
          firstRow['Batch Name'] || firstRow['Batch'] || firstRow['Batch name'];
        if (batchColumn && batchColumn.toString().trim() !== '') {
          const batchName = batchColumn.toString().trim();
          const existingBatch = await this.repository.findBatchByName(batchName);
          if (existingBatch) {
            batchId = existingBatch.id;
          } else {
            const newBatch = await this.repository.createBatch({
              name: batchName,
            });
            batchId = newBatch.id;
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

        const retrieval = await this.repository.createRetrieval(retrievalData);
        retrievals.push(retrieval);
        created.push({ hotel_id: hotelId, retrieval_id: retrieval.id });

        if (firstOtaProvider === null) {
          firstOtaProvider = otaProvider;
          await this.repository.updateParentRetrieval(parentRetrieval.id, {
            ota_provider: otaProvider,
          });
        }

        if (otaProvider === OTAProvider.Agoda) {
          const retrievalItems: CreateRetrievalItemDto[] = [];

          for (const row of rows) {
            const checkInDate = this.parseExcelDate(
              row['From (MM/DD/YYYY)'] || row['Check In'] || row['Check in'],
            );
            const checkOutDate = this.parseExcelDate(
              row['To (MM/DD/YYYY)'] || row['Check Out'] || row['Check out'],
            );

            if (!checkInDate || !checkOutDate) continue;

            const guestName =
              row['Name']?.toString() ||
              row['Customer Name']?.toString() ||
              'Unknown';

            const amountRaw = row['Amount to charge'];
            const amount =
              amountRaw !== undefined && amountRaw !== null && amountRaw !== ''
                ? parseFloat(amountRaw)
                : null;

            const cardNumber = row['Card Number']
              ? row['Card Number'].toString()
              : row['Card first 4']
                ? `${row['Card first 4'].toString()}${row['Card last 12'].toString()}`
                : row['Card First 4']
                  ? `${row['Card First 4'].toString()}${row['Card Last 12'].toString()}`
                  : null;
            const expiryCode = row['Expiry Code']
              ? row['Expiry Code'].toString()
              : row['Card Expire']
                ? row['Card Expire'].toString()
                : null;
            const cvcCode = row['CVC Code']
              ? row['CVC Code'].toString()
              : row['Card CVV']
                ? row['Card CVV'].toString()
                : null;

            const chargeStatus = row['Charge status'] || row['Charge Status'];
            const hasCardInfo = !!(cardNumber || expiryCode || cvcCode);

            retrievalItems.push({
              retrieval_id: retrieval.id,
              parent_retrieval_id: parentRetrieval.id,
              property_id: property.id,
              guest_name: guestName,
              reservation_id:
                (
                  row['Reservation ID'] ||
                  row['Agoda ID'] ||
                  row['Expedia ID']
                )?.toString() || undefined,
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
                      amount_to_charge_or_refund_currency:
                        (
                          row['Currency'] ??
                          row['Curency'] ??
                          firstRow['Currency'] ??
                          firstRow['Curency']
                        )
                          ?.toString()
                          .trim() || 'USD',
                    }
                  : undefined,
              reservation_status: chargeStatus
                ? chargeStatus.toString()
                : 'Pending',
              additional_text: undefined,
            });
          }

          if (retrievalItems.length > 0) {
            await this.repository.createManyRetrievalItems(retrievalItems);
            retrievalItemsCount += retrievalItems.length;
          }
        }

        successCount++;
      } catch (error: any) {
        const message =
          error instanceof Error ? error.message : 'Unknown error occurred';
        this.logger.error(
          `Error processing Hotel ID: ${hotelId} - ${message}`,
          error?.stack,
        );
        failedCount++;
        failedHotelIds.push(hotelId);
        errors.push({ hotel_id: hotelId, name: hotelName, error: message });
      }
    }

    this.logger.log(
      `Retrieval import completed: parent=${parentRetrieval.id}, success=${successCount}, failed=${failedCount}, items=${retrievalItemsCount}, portfolios=${createdPortfoliosCount}, properties=${createdPropertiesCount}`,
    );

    return {
      parentRetrieval,
      retrievals,
      successCount,
      failedCount,
      failedHotelIds,
      retrievalItemsCount,
      errors,
      created,
    };
  }

  /**
   * Builds the per-retrieval XLSX row used in both
   * `exportRetrievalItemsToExcel` and the new bulk export path. Kept in
   * one place so the two export paths can never drift in column order
   * or content.
   */
  private async buildRetrievalExcelRowsForRetrieval(
    items: ReadonlyArray<RetrievalItem & { retrieval: Retrieval }>,
  ): Promise<Record<string, unknown>[]> {
    const excelData: Record<string, unknown>[] = [];
    for (const item of items) {
      const property: any = await this.propertyRepository.findById(
        item.property_id,
      );
      const retrieval: any = (item as any).retrieval;

      let batchName = '';
      if (retrieval?.batch_id) {
        const batch = await this.repository.findBatchById(retrieval.batch_id);
        batchName = batch?.name || '';
      }

      const credentials =
        await this.propertyCredentialsService.getPropertyCredentialsByPropertyId(
          item.property_id,
        );
      let username = '';
      let password = '';
      if (credentials) {
        if (retrieval?.ota_provider === 'Agoda') {
          username = credentials.agodaUsername || '';
          password = credentials.agodaPassword
            ? this.propertyCredentialsService.decryptPassword(
                credentials.agodaPassword,
              )
            : '';
        } else {
          username = credentials.expediaUsername || '';
          password = credentials.expediaPassword
            ? this.propertyCredentialsService.decryptPassword(
                credentials.expediaPassword,
              )
            : '';
        }
      }

      const isBookingOta = retrieval?.ota_provider === 'Booking';
      const checkInOutForExport = (date: Date | string | null | undefined) =>
        date ? new Date(date).toLocaleDateString() : '';

      const row: Record<string, unknown> = {
        'Hotel ID':
          retrieval?.ota_provider === 'Expedia'
            ? property?.expedia_id || ''
            : retrieval?.ota_provider === 'Agoda'
              ? property?.agoda_id || ''
              : '',
        Batch: batchName,
        'Posting Type': retrieval?.posting_type || '',
        'OTA Provider': retrieval?.ota_provider || '',
        Portfolio: retrieval?.portfolio_name || '',
        'Hotel Name': property?.name || '',
        'Reservation ID': item.reservation_id || '',
        Name: item.guest_name || '',
        'Check In': isBookingOta
          ? 'N/A'
          : checkInOutForExport(item.check_in_date),
        'Check Out': isBookingOta
          ? 'N/A'
          : checkInOutForExport(item.check_out_date),
        'User Name': username,
        Password: password,
        Currency:
          (item.payment_info as any)?.amount_to_charge_or_refund_currency ||
          'USD',
        'Amount to charge':
          (item.payment_info as any)?.amount_to_charge_or_refund || 0,
        'Charge status': item.reservation_status || '',
        'Card first 4': (item.card_info as any)?.card_number?.slice(0, 4) || '',
        'Card last 12': (item.card_info as any)?.card_number
          ? String((item.card_info as any).card_number)
              .replace(/\D/g, '')
              .slice(-12)
          : '',
        'Card Expire': (item.card_info as any)?.expiry_date || '',
        'Card CVV':
          (item.card_info as any)?.cvv == null ||
          (item.card_info as any)?.cvv === ''
            ? ''
            : String((item.card_info as any).cvv),
        isMissing: item.additional_text || 'Present',
      };
      excelData.push(row);
    }
    return excelData;
  }

  /**
   * Produces one XLSX buffer per retrieval, ready to be placed inside a ZIP
   * by `/reports/export-master`. Filename for each entry mirrors the
   * per-job CSV convention used by `/jobs/export-master`:
   *   `{OTA}-{property}-{startDate}-{endDate}.xlsx`
   *
   * Retrievals that have no items are silently skipped (consistent with
   * how jobs without items are skipped by `exportMasterCsv`).
   */
  async buildRetrievalExportEntries(
    retrievalIds: string[],
  ): Promise<Array<{ name: string; data: Buffer }>> {
    try {
      const unique = Array.from(new Set(retrievalIds ?? [])).filter(Boolean);
      if (unique.length === 0) return [];

      const grouped =
        await this.repository.findRetrievalItemsByRetrievalIdsForExport(unique);

      const usedNames = new Set<string>();
      const entries: Array<{ name: string; data: Buffer }> = [];

      // Preserve the caller-provided order so the export reflects the
      // sort the user saw on the Reports page.
      for (const retrievalId of unique) {
        const items = grouped.get(retrievalId) ?? [];
        if (items.length === 0) {
          this.logger.warn(
            `Retrieval ${retrievalId} has no items — skipping in export`,
          );
          continue;
        }

        const excelRows = await this.buildRetrievalExcelRowsForRetrieval(items);
        if (excelRows.length === 0) continue;

        const worksheet = XLSX.utils.json_to_sheet(excelRows);
        applyExcelTextColumnFormat(
          worksheet,
          excelRows as ReadonlyArray<Record<string, unknown>>,
          RETRIEVAL_EXPORT_CVV_COLUMN,
        );
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Retrieval Items');
        const buffer = XLSX.write(workbook, {
          type: 'buffer',
          bookType: 'xlsx',
        });

        const retrieval = items[0].retrieval as any;
        const name = ensureUniqueFilename(
          `${this.buildRetrievalFileBaseName(retrieval)}.xlsx`,
          usedNames,
        );
        entries.push({ name, data: buffer });
      }

      return entries;
    } catch (error) {
      this.logger.error(
        `Error building retrieval export entries: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private buildRetrievalFileBaseName(retrieval: any): string {
    const ota = sanitizeForFilename(
      (retrieval?.ota_provider ?? '').toString() || 'OTA',
    );
    const property = sanitizeForFilename(
      retrieval?.property_name ?? 'property',
    );
    const startDate = formatDateForFilename(retrieval?.start_date);
    const endDate = formatDateForFilename(retrieval?.end_date);
    return `${ota}-${property}-${startDate}-${endDate}`;
  }

  async exportRetrievalItemsToExcel(
    parentRetrievalId: string,
  ): Promise<Buffer> {
    try {
      console.log('exportRetrievalItemsToExcel', parentRetrievalId);
      // Get parent retrieval
      const parentRetrieval =
        await this.repository.findParentRetrievalById(parentRetrievalId);
      if (!parentRetrieval) {
        throw new BadRequestException('Parent retrieval not found');
      }

      // Get all retrieval items for this parent retrieval (use raw MongoDB path
      // to avoid Prisma "Failed to convert rust String into napi string" on invalid UTF-8)
      const retrievalItems =
        await this.repository.findRetrievalItemsByParentRetrievalIdForExport(
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
          // Check OTA provider and fetch appropriate credentials
          if (retrieval?.ota_provider === 'Agoda') {
            username = credentials.agodaUsername || '';
            password = credentials.agodaPassword
              ? this.propertyCredentialsService.decryptPassword(
                  credentials.agodaPassword,
                )
              : '';
          } else {
            // Default to Expedia credentials for Expedia and other providers
            username = credentials.expediaUsername || '';
            password = credentials.expediaPassword
              ? this.propertyCredentialsService.decryptPassword(
                  credentials.expediaPassword,
                )
              : '';
          }
        }

        const isBookingOta = retrieval?.ota_provider === 'Booking';
        const checkInOutForExport = (date: Date | string | null | undefined) =>
          date ? new Date(date).toLocaleDateString() : '';

        const row = {
          'Hotel ID':
            retrieval?.ota_provider === 'Expedia'
              ? property?.expedia_id || ''
              : retrieval?.ota_provider === 'Agoda'
                ? property?.agoda_id || ''
                : '',
          Batch: batchName,
          'Posting Type': retrieval?.posting_type || '',
          'OTA Provider': retrieval?.ota_provider || '',
          Portfolio: retrieval?.portfolio_name || '',
          'Hotel Name': property?.name || '',
          'Reservation ID': item.reservation_id || '',
          Name: item.guest_name || '',
          'Check In': isBookingOta
            ? 'N/A'
            : checkInOutForExport(item.check_in_date),
          'Check Out': isBookingOta
            ? 'N/A'
            : checkInOutForExport(item.check_out_date),
          'User Name': username,
          Password: password,
          Currency:
            item.payment_info?.amount_to_charge_or_refund_currency || 'USD',
          'Amount to charge':
            item.payment_info?.amount_to_charge_or_refund || 0,
          'Charge status': item.reservation_status || '',
          'Card first 4': item.card_info?.card_number?.slice(0, 4) || '',
          'Card last 12': item.card_info?.card_number
            ? String(item.card_info.card_number).replace(/\D/g, '').slice(-12)
            : '',
          'Card Expire': item.card_info?.expiry_date || '',
          'Card CVV':
            item.card_info?.cvv == null || item.card_info?.cvv === ''
              ? ''
              : String(item.card_info.cvv),
          isMissing: item.additional_text || 'Present',
        };

        excelData.push(row);
      }

      // Create Excel workbook
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      applyExcelTextColumnFormat(
        worksheet,
        excelData as ReadonlyArray<Record<string, unknown>>,
        RETRIEVAL_EXPORT_CVV_COLUMN,
      );
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
      const result =
        await this.repository.findRetrievalsByParentRetrievalId(
          parentRetrievalId,
          query,
        );
      // Normalize so failed_reason and screenshot_urls are always present
      const data = (result.data || []).map((retrieval: any) => ({
        ...retrieval,
        failed_reason: retrieval.failed_reason ?? '',
        screenshot_urls: Array.isArray(retrieval.screenshot_urls)
          ? retrieval.screenshot_urls
          : [],
      }));
      return { ...result, data };
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

  async updateParentRetrieval(
    id: string,
    data: UpdateParentRetrievalDto,
  ): Promise<ParentRetrieval> {
    try {
      return await this.repository.updateParentRetrieval(id, data);
    } catch (error) {
      this.logger.error(
        `Error updating parent retrieval: ${error.message}`,
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

  async bulkArchiveParentRetrievals(
    parentRetrievalIds: string[],
    status: boolean,
  ): Promise<{ updatedCount: number; status: boolean }> {
    try {
      if (!parentRetrievalIds || parentRetrievalIds.length === 0) {
        throw new Error('parent_retrieval_ids array cannot be empty');
      }

      const result = await this.repository.bulkArchiveParentRetrievalsUpdate(
        parentRetrievalIds,
        status,
      );
      return {
        updatedCount: result.count,
        status: status,
      };
    } catch (error) {
      this.logger.error(
        `Error bulk updating parent retrievals archive status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async bulkDeleteParentRetrievals(parentRetrievalIds: string[]): Promise<{
    deletedCount: number;
    deletedRetrievalsCount: number;
    deletedRetrievalItemsCount: number;
    deletedParentRetrievalIds: string[];
  }> {
    try {
      if (!parentRetrievalIds || parentRetrievalIds.length === 0) {
        throw new Error('parent_retrieval_ids array cannot be empty');
      }

      const result =
        await this.repository.bulkDeleteParentRetrievals(parentRetrievalIds);
      return result;
    } catch (error) {
      this.logger.error(
        `Error bulk deleting parent retrievals: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
