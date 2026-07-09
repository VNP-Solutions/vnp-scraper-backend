import { Inject, Injectable, Logger } from '@nestjs/common';
import { Property } from '@prisma/client';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import { CreatePropertyDto, SyncDeleteDto, UpdatePropertyDto, UpsertPropertyDto } from './property.dto';
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
      return this.processProperty(property);
    } catch (error) {
      this.logger.error(
        `Error finding property: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async syncCreate(data: CreatePropertyDto): Promise<{ status: string; id?: string }> {
    // duplicate check (unchanged)
    if (data.expedia_id || data.booking_id || data.agoda_id) {
      const existing = await this.repository.findByOtaIds({
        expedia_id: data.expedia_id ?? null,
        booking_id: data.booking_id ?? null,
        agoda_id:   data.agoda_id   ?? null,
      })
      if (existing) {
        this.logger.log(`[sync] property already exists by OTA id: ${existing.id}`)
        return { status: 'already_exists', id: existing.id }
      }
    } else {
      const existing = await this.repository.findByName(data.name)
      if (existing) {
        this.logger.log(`[sync] property already exists by name: ${data.name}`)
        return { status: 'already_exists', id: existing.id }
      }
    }
  
    let portfolioId: string | undefined
    if (data.portfolio_name) {
      const existingPf = await this.repository.findPortfolioByName(data.portfolio_name)
      portfolioId = existingPf
        ? existingPf.id
        : (await this.repository.createPortfolio(data.portfolio_name)).id
      this.logger.log(`[sync] portfolio "${data.portfolio_name}" -> ${portfolioId}`)
    }
  
    let subPortfolioId: string | undefined
    if (data.sub_portfolio_name && portfolioId) {
      const existingSub = await this.repository.findSubPortfolioByNameAndPortfolio(
        data.sub_portfolio_name,
        portfolioId,
      )
      subPortfolioId = existingSub
        ? existingSub.id
        : (await this.repository.createSubPortfolio(data.sub_portfolio_name, portfolioId)).id
    }
  
    const created = await this.createProperty({
      ...data,
      portfolio_id: portfolioId,        // scraper id, not DBMS id
      sub_portfolio_id: subPortfolioId,
    })
    return { status: 'created', id: created.id }
  }

  async syncDelete(dto: SyncDeleteDto): Promise<{ status: string; id?: string }> {
    if (dto.expedia_id == null && dto.booking_id == null && dto.agoda_id == null) {
      return { status: 'no_ota_ids' }
    }
    const existing = await this.repository.findByOtaIds({
      expedia_id: dto.expedia_id ?? null,
      booking_id: dto.booking_id ?? null,
      agoda_id:   dto.agoda_id   ?? null,
    })
    if (!existing) {
      this.logger.log(`[sync] delete: property not found for OTA ids`)
      return { status: 'not_found' }
    }
    await this.repository.delete(existing.id)
    this.logger.log(`[sync] property deleted: ${existing.id}`)
    return { status: 'deleted', id: existing.id }
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

  async importExpediaCredentialsFromExcel(
    file: Express.Multer.File,
  ): Promise<{
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

  async updateOtaCredentials(
    body: UpdateOtaCredentialsBody,
  ): Promise<{
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
    created: number; alreadyExists: number; failed: number;
    results: Array<{ name: string; status: string; id?: string }>;
  }> {
    let created = 0, alreadyExists = 0, failed = 0;
    const results: Array<{ name: string; status: string; id?: string }> = [];
  
    for (const item of items) {
      try {
        const r = await this.syncCreate(item);
        if (r.status === 'created') created++;
        else if (r.status === 'already_exists') alreadyExists++;
        results.push({ name: item.name, status: r.status, id: r.id });
      } catch (e: any) {
        failed++;
        this.logger.error(`[sync] bulk create failed for "${item.name}": ${e?.message ?? e}`);
        results.push({ name: item.name, status: 'failed' });
      }
    }
  
    this.logger.log(`[sync] bulk create done: created=${created}, exists=${alreadyExists}, failed=${failed}`);
    return { created, alreadyExists, failed, results };
  }

  async upsertPropertyByParentId(
    parentId: string,
    data: UpsertPropertyDto,
  ): Promise<Property> {
    try {
      const property = await this.repository.upsertByParentId(parentId, data);
      return this.processProperty(property);
    } catch (error) {
      this.logger.error(
        `Error upserting property by parent_id ${parentId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
