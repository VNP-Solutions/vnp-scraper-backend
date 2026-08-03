import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Property } from '@prisma/client';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import {
  CreatePropertyDto,
  SyncBulkDeletePropertyDto,
  SyncBulkDeletePropertyResultDto,
  SyncBulkUpsertPropertyItemDto,
  SyncBulkUpsertPropertyResultDto,
  SyncDeleteDto,
  SyncUpsertPropertyDto,
  UpdatePropertyDto,
} from './property.dto';
import type { RevealOtaCredentialsBody } from './property.validation';
import {
  IPropertyRepository,
  IPropertyService,
  PropertyDropdownItem,
} from './property.interface';
import type { UpdateOtaCredentialsBody } from './property.validation';

@Injectable()
export class PropertyService implements IPropertyService {
  constructor(
    @Inject('IPropertyRepository')
    private readonly repository: IPropertyRepository,
    private readonly logger: Logger,
    private readonly encryptionUtil: EncryptionUtil,
  ) {}

  async createProperty(data: CreatePropertyDto): Promise<Property> {
    try {
      const property = await this.repository.create(data);
      return this.processProperty(property);
    } catch (error) {
      this.logger.error(
        `Error creating property: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAllProperties(query?: Record<string, any>): Promise<any> {
    try {
      const data = await this.repository.findAll(query);
      for (let property of data.properties) {
        property = this.processProperty(property);
      }
      return data;
    } catch (error) {
      this.logger.error(
        `Error getting properties: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getPropertyById(id: string): Promise<Property> {
    try {
      const property = await this.repository.findById(id);
      if (!property) {
        throw new Error(`Property with ID ${id} not found`);
      }
      const processed = this.processProperty(property);
      this.decryptOtaCredentialPasswords(processed.credentials);
      return processed;
    } catch (error) {
      this.logger.error(
        `Error finding property: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async syncCreate(
    data: CreatePropertyDto,
  ): Promise<{ status: string; id?: string }> {
    // duplicate check (unchanged)
    if (data.expedia_id || data.booking_id || data.agoda_id) {
      const existing = await this.repository.findByOtaIds({
        expedia_id: data.expedia_id ?? null,
        booking_id: data.booking_id ?? null,
        agoda_id: data.agoda_id ?? null,
      });
      if (existing) {
        this.logger.log(
          `[sync] property already exists by OTA id: ${existing.id}`,
        );
        return { status: 'already_exists', id: existing.id };
      }
    } else {
      const existing = await this.repository.findByName(data.name);
      if (existing) {
        this.logger.log(`[sync] property already exists by name: ${data.name}`);
        return { status: 'already_exists', id: existing.id };
      }
    }

    let portfolioId: string | undefined;
    if (data.portfolio_name) {
      const existingPf = await this.repository.findPortfolioByName(
        data.portfolio_name,
      );
      portfolioId = existingPf
        ? existingPf.id
        : (await this.repository.createPortfolio(data.portfolio_name)).id;
      this.logger.log(
        `[sync] portfolio "${data.portfolio_name}" -> ${portfolioId}`,
      );
    }

    let subPortfolioId: string | undefined;
    if (data.sub_portfolio_name && portfolioId) {
      const existingSub =
        await this.repository.findSubPortfolioByNameAndPortfolio(
          data.sub_portfolio_name,
          portfolioId,
        );
      subPortfolioId = existingSub
        ? existingSub.id
        : (
            await this.repository.createSubPortfolio(
              data.sub_portfolio_name,
              portfolioId,
            )
          ).id;
    }

    const created = await this.createProperty({
      ...data,
      portfolio_id: portfolioId, // scraper id, not DBMS id
      sub_portfolio_id: subPortfolioId,
    });
    return { status: 'created', id: created.id };
  }

  async syncDelete(
    dto: SyncDeleteDto,
  ): Promise<{ status: string; id?: string }> {
    if (
      dto.expedia_id == null &&
      dto.booking_id == null &&
      dto.agoda_id == null
    ) {
      return { status: 'no_ota_ids' };
    }
    const existing = await this.repository.findByOtaIds({
      expedia_id: dto.expedia_id ?? null,
      booking_id: dto.booking_id ?? null,
      agoda_id: dto.agoda_id ?? null,
    });
    if (!existing) {
      this.logger.log(`[sync] delete: property not found for OTA ids`);
      return { status: 'not_found' };
    }
    await this.repository.delete(existing.id);
    this.logger.log(`[sync] property deleted: ${existing.id}`);
    return { status: 'deleted', id: existing.id };
  }

  async updateProperty(id: string, data: UpdatePropertyDto): Promise<Property> {
    try {
      const property = await this.repository.update(id, data);
      return this.processProperty(property);
    } catch (error) {
      this.logger.error(
        `Error updating property: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async deleteProperty(id: string): Promise<Property> {
    try {
      const property = await this.repository.delete(id);
      return property;
    } catch (error) {
      this.logger.error(
        `Error deleting property: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getPermission(id: string, userId: string): Promise<any> {
    return this.repository.getPermission(id, userId);
  }

  async getFilteredProperty(
    userId: string,
    query?: Record<string, any>,
  ): Promise<any> {
    const data = await this.repository.findFilteredProperty(userId, query);
    for (let property of data.properties) {
      property = this.processProperty(property);
    }
    return data;
  }

  async getPermissionByPortfolioId(
    portfolioId: string,
    userId: string,
  ): Promise<any> {
    return this.repository.getPermissionByPortfolioId(portfolioId, userId);
  }

  async getPermissionBySubPortfolioId(
    subPortfolioId: string,
    userId: string,
  ): Promise<any> {
    return this.repository.getPermissionBySubPortfolioId(
      subPortfolioId,
      userId,
    );
  }

  async getPropertyByPortfolioId(portfolioId: string): Promise<any> {
    return this.repository.findPropertyByPortfolioId(portfolioId);
  }

  async getPropertyBySubPortfolioId(subPortfolioId: string): Promise<any> {
    return this.repository.findPropertyBySubPortfolioId(subPortfolioId);
  }

  applyPropertyCredentialsShape(property: any | null | undefined): void {
    if (property == null) return;
    const credential = { ...property.credentials?.[0] };
    property.credentials = credential;
  }

  private processProperty(property: any) {
    // Decrypt the password when returning property data
    if (property.user_password) {
      try {
        property.user_password = this.encryptionUtil.decryptPassword(
          property.user_password,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to decrypt password for property ${property.id}: ${error.message}`,
        );
        // Keep the encrypted password if decryption fails
      }
    }

    this.applyPropertyCredentialsShape(property);
    return property;
  }

  private decryptOtaCredentialPasswords(
    credentials: Record<string, unknown> | null | undefined,
  ): void {
    if (!credentials || typeof credentials !== 'object') {
      return;
    }

    const passwordFields = [
      'expediaPassword',
      'agodaPassword',
      'bookingPassword',
    ];
    for (const field of passwordFields) {
      const encrypted = credentials[field];
      if (encrypted == null || String(encrypted).trim() === '') {
        continue;
      }
      try {
        credentials[field] = this.encryptionUtil.decryptPassword(
          String(encrypted),
        );
      } catch (error) {
        this.logger.warn(
          `Failed to decrypt ${field} for property credentials: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async findPortfolioAndSubPortfolioForDropdown(user: any): Promise<any> {
    return this.repository.findPortfolioAndSubPortfolioForDropdown(user);
  }

  async getAllPropertiesByUserPermission(
    userId: string,
    isAdmin: boolean,
  ): Promise<PropertyDropdownItem[]> {
    try {
      // Dropdown payload only needs id/name/portfolio_id – skip decrypt &
      // credentials reshape work done by processProperty.
      return await this.repository.findAllByUserPermission(userId, isAdmin);
    } catch (error) {
      this.logger.error(
        `Error getting properties by user permission: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get decrypted credentials for authentication purposes
   * @param propertyId - Property ID
   * @returns Object with decrypted user_email and user_password
   */
  // async getPropertyCredentials(
  //   propertyId: string,
  // ): Promise<any> {
  //   try {
  //     const property = await this.repository.findById(propertyId);
  //     if (!property) {
  //       throw new Error(`Property with ID ${propertyId} not found`);
  //     }

  //     return property
  //   } catch (error) {
  //     this.logger.error(
  //       `Error getting property credentials: ${error.message}`,
  //       error.stack,
  //     );
  //     throw error;
  //   }
  // }

  /**
   * Import properties from Excel file
   * Delegates to repository for reusable implementation
   *
   * @param file - Excel file buffer
   * @returns Object containing creation counts and created entities
   */
  async importPropertiesFromExcel(file: Express.Multer.File): Promise<{
    portfoliosCreated: number;
    subPortfoliosCreated: number;
    propertiesCreated: number;
    credentialsCreated: number;
    portfolios: any[];
    subPortfolios: any[];
    properties: any[];
  }> {
    try {
      this.logger.log('Starting Excel import process via repository');
      const result = await this.repository.importPropertiesFromExcel(file);
      this.logger.log('Excel import completed successfully');
      return result;
    } catch (error) {
      this.logger.error(
        `Error in service layer during Excel import: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async importExpediaCredentialsFromExcel(file: Express.Multer.File): Promise<{
    updated: number;
    propertyNotFound: number;
    rowsSkippedInvalid: number;
    failures: Array<{ row: number; expediaId?: number; reason: string }>;
  }> {
    try {
      this.logger.log('Starting Expedia credentials Excel import');
      const result =
        await this.repository.importExpediaCredentialsFromExcel(file);
      this.logger.log(
        `Expedia credentials import finished: ${result.updated} updated`,
      );
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error importing Expedia credentials from Excel: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  async updateOtaCredentials(body: UpdateOtaCredentialsBody): Promise<{
    updated: number;
    propertyNotFound: boolean;
    failures: Array<{ reason: string; property_id?: string }>;
  }> {
    try {
      this.logger.log(
        `Updating OTA credentials for property_id=${body.property_id}, provider=${body.ota_provider}`,
      );
      const result = await this.repository.updateOtaCredentials(body);
      this.logger.log(
        `OTA credentials update finished: ${result.updated} updated, propertyNotFound=${result.propertyNotFound}`,
      );
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error updating OTA credentials: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  async getOtaCredentialsReveal(body: RevealOtaCredentialsBody): Promise<{
    propertyNotFound: boolean;
    credentialsNotFound: boolean;
    username: string;
    password: string;
  }> {
    try {
      this.logger.log(
        `Reveal OTA credentials for property_id=${body.property_id}, provider=${body.ota_provider}`,
      );
      return await this.repository.getOtaCredentialsReveal(
        body.property_id,
        body.ota_provider,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error revealing OTA credentials: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  async syncBulkCreate(items: CreatePropertyDto[]): Promise<{
    created: number;
    alreadyExists: number;
    failed: number;
    results: Array<{ name: string; status: string; id?: string }>;
  }> {
    let created = 0,
      alreadyExists = 0,
      failed = 0;
    const results: Array<{ name: string; status: string; id?: string }> = [];

    for (const item of items) {
      try {
        const r = await this.syncCreate(item);
        if (r.status === 'created') created++;
        else if (r.status === 'already_exists') alreadyExists++;
        results.push({ name: item.name, status: r.status, id: r.id });
      } catch (e: any) {
        failed++;
        this.logger.error(
          `[sync] bulk create failed for "${item.name}": ${e?.message ?? e}`,
        );
        results.push({ name: item.name, status: 'failed' });
      }
    }

    this.logger.log(
      `[sync] bulk create done: created=${created}, exists=${alreadyExists}, failed=${failed}`,
    );
    return { created, alreadyExists, failed, results };
  }

  async syncUpsertProperty(
    parentId: string,
    dto: SyncUpsertPropertyDto,
  ): Promise<{ action: 'created' | 'updated'; property: Property }> {
    const trimmedParent = (parentId ?? '').trim();
    if (!trimmedParent) {
      throw new BadRequestException('Parent ID is required');
    }

    const action = await this.syncUpsert(trimmedParent, {
      row: 1,
      parent_id: trimmedParent,
      ...dto,
    });

    const property = await this.repository.findByParentId(trimmedParent);
    if (!property) {
      throw new Error('Property not found after sync upsert');
    }

    return { action, property };
  }

  async syncBulkUpsert(
    items: SyncBulkUpsertPropertyItemDto[],
  ): Promise<SyncBulkUpsertPropertyResultDto> {
    if (!Array.isArray(items) || !items.length) {
      throw new BadRequestException('No items provided');
    }

    const result: SyncBulkUpsertPropertyResultDto = {
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
        if (!name) throw new Error('Property name is required');

        const portfolioParentId =
          typeof item.portfolio_parent_id === 'string'
            ? item.portfolio_parent_id.trim()
            : '';
        if (!portfolioParentId)
          throw new Error('Portfolio Parent ID is required');

        const action = await this.syncUpsert(parentId, {
          ...item,
          name,
          portfolio_parent_id: portfolioParentId,
        });

        if (action === 'created') result.createdCount++;
        else result.updatedCount++;

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

  private async syncUpsert(
    parentId: string,
    item: SyncBulkUpsertPropertyItemDto,
  ): Promise<'created' | 'updated'> {
    const portfolio = await this.repository.findPortfolioByParentId(
      item.portfolio_parent_id,
    );
    if (!portfolio) {
      throw new Error(
        `Portfolio not found with parent_id: ${item.portfolio_parent_id}`,
      );
    }

    const existing = await this.repository.findByParentId(parentId);

    const propertyData: any = {
      name: item.name,
      parent_id: parentId,
      portfolio_id: portfolio.id,
      expedia_id: item.expedia_id,
      booking_id: item.booking_id,
      agoda_id: item.agoda_id,
    };

    let propertyId: string;
    let action: 'created' | 'updated';

    if (existing) {
      if (item.name !== existing.name) {
        const clash = await this.repository.findByName(item.name);
        if (clash && clash.id !== existing.id) {
          throw new Error('Property with this name already exists');
        }
      }
      const updated = await this.repository.update(existing.id, propertyData);
      if (!updated) throw new Error('Failed to update property');
      propertyId = updated.id;
      action = 'updated';
    } else {
      const clash = await this.repository.findByName(item.name);
      if (clash) throw new Error('Property with this name already exists');
      const created = await this.repository.create(propertyData);
      propertyId = created.id;
      action = 'created';
    }

    await this.repository.updatePropertyCredentials(propertyId, {
      expediaUsername: item.expedia_username,
      expediaPassword: item.expedia_password,
      agodaUsername: item.agoda_username,
      agodaPassword: item.agoda_password,
      bookingUsername: item.booking_username,
      bookingPassword: item.booking_password,
    });

    return action;
  }

  async syncDeleteByParentId(parentId: string): Promise<{ message: string }> {
    const trimmedParent = (parentId ?? '').trim();
    if (!trimmedParent) {
      throw new BadRequestException('Parent ID is required');
    }

    const existing = await this.repository.findByParentId(trimmedParent);
    if (!existing) {
      throw new NotFoundException(
        `Property not found with parent_id: ${trimmedParent}`,
      );
    }

    const deleted = await this.repository.delete(existing.id);
    if (!deleted) {
      throw new Error('Failed to delete property');
    }

    this.logger.log(`[sync] property deleted by parent_id: ${trimmedParent}`);
    return { message: 'Property deleted successfully' };
  }

  async syncBulkDelete(
    dto: SyncBulkDeletePropertyDto,
  ): Promise<SyncBulkDeletePropertyResultDto> {
    const items = dto.items ?? [];
    if (!items.length) {
      throw new BadRequestException('No items provided');
    }

    const result: SyncBulkDeletePropertyResultDto = {
      totalCount: items.length,
      deletedCount: 0,
      failureCount: 0,
      errors: [],
      successfulDeletes: [],
    };

    for (const item of items) {
      const parentId =
        typeof item.parent_id === 'string' ? item.parent_id.trim() : '';

      if (!parentId) {
        result.errors.push({
          parent_id: 'Unknown',
          error: 'Parent ID is required',
        });
        result.failureCount++;
        continue;
      }

      try {
        const existing = await this.repository.findByParentId(parentId);
        if (!existing) {
          throw new Error(`Property not found with parent_id: ${parentId}`);
        }
        const deleted = await this.repository.delete(existing.id);
        if (!deleted) throw new Error('Failed to delete property');

        result.deletedCount++;
        result.successfulDeletes.push({ parent_id: parentId });
      } catch (error) {
        result.errors.push({
          parent_id: parentId,
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
        });
        result.failureCount++;
      }
    }

    return result;
  }
}
