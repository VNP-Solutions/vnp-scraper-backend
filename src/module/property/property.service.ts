import { Inject, Injectable, Logger } from '@nestjs/common';
import { Property } from '@prisma/client';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import { CreatePropertyDto, UpdatePropertyDto } from './property.dto';
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
}
