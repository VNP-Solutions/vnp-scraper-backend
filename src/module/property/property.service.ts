import { Inject, Injectable, Logger } from '@nestjs/common';
import { Property } from '@prisma/client';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import { CreatePropertyDto, UpdatePropertyDto } from './property.dto';
import { IPropertyRepository, IPropertyService } from './property.interface';

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
      // Encrypt the password before saving
      const encryptedData = {
        ...data,
        user_password: this.encryptionUtil.encryptPassword(data.user_password),
      };

      const property = await this.repository.create(encryptedData);
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
      // Encrypt the password before updating if it's provided
      const updateData = { ...data };
      if (data.user_password) {
        updateData.user_password = this.encryptionUtil.encryptPassword(
          data.user_password,
        );
      }

      const property = await this.repository.update(id, updateData);
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

    const credential = { ...property.credentials?.[0] };
    property.credentials = credential;
    return property;
  }

  async findPortfolioAndSubPortfolioForDropdown(user: any): Promise<any> {
    return this.repository.findPortfolioAndSubPortfolioForDropdown(user);
  }

  async getAllPropertiesByUserPermission(
    userId: string,
    isAdmin: boolean,
  ): Promise<Property[]> {
    try {
      const properties = await this.repository.findAllByUserPermission(
        userId,
        isAdmin,
      );
      return properties.map(property => this.processProperty(property));
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
  async getPropertyCredentials(
    propertyId: string,
  ): Promise<{ user_email: string; user_password: string }> {
    try {
      const property = await this.repository.findById(propertyId);
      if (!property) {
        throw new Error(`Property with ID ${propertyId} not found`);
      }

      const decryptedPassword = property.user_password
        ? this.encryptionUtil.decryptPassword(property.user_password)
        : '';

      return {
        user_email: property.user_email,
        user_password: decryptedPassword,
      };
    } catch (error) {
      this.logger.error(
        `Error getting property credentials: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
