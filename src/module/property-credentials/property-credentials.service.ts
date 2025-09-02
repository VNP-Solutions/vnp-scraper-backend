import { Inject, Injectable, Logger } from '@nestjs/common';
import { PropertyCredentials } from '@prisma/client';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import {
  BulkUpdatePropertyCredentialsDto,
  CreatePropertyCredentialsDto,
  UpdatePropertyCredentialsDto,
} from './property-credentials.dto';
import {
  IPropertyCredentialsRepository,
  IPropertyCredentialsService,
} from './property-credentials.interface';

@Injectable()
export class PropertyCredentialsService implements IPropertyCredentialsService {
  constructor(
    @Inject('IPropertyCredentialsRepository')
    private readonly repository: IPropertyCredentialsRepository,
    private readonly logger: Logger,
    private readonly encryptionUtil: EncryptionUtil,
  ) {}

  async createPropertyCredentials(
    data: CreatePropertyCredentialsDto,
  ): Promise<PropertyCredentials> {
    try {
      let encryptedData = { ...data };
      if (data.expediaPassword) {
        encryptedData.expediaPassword = this.encryptionUtil.encryptPassword(
          data.expediaPassword,
        );
      }
      if (data.agodaPassword) {
        encryptedData.agodaPassword = this.encryptionUtil.encryptPassword(
          data.agodaPassword,
        );
      }
      if (data.bookingPassword) {
        encryptedData.bookingPassword = this.encryptionUtil.encryptPassword(
          data.bookingPassword,
        );
      }
      const credentials = await this.repository.create(encryptedData);
      return credentials;
    } catch (error) {
      this.logger.error(
        `Error creating property credentials: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAllPropertyCredentials(): Promise<PropertyCredentials[]> {
    try {
      const credentials = await this.repository.findAll();
      return credentials;
    } catch (error) {
      this.logger.error(
        `Error getting property credentials: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getPropertyCredentialsById(id: string): Promise<PropertyCredentials> {
    try {
      const credentials = await this.repository.findById(id);
      if (!credentials) {
        throw new Error(`Property credentials with ID ${id} not found`);
      }
      return credentials;
    } catch (error) {
      this.logger.error(
        `Error finding property credentials: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updatePropertyCredentials(
    id: string,
    data: UpdatePropertyCredentialsDto,
  ): Promise<PropertyCredentials> {
    try {
      let encryptedData = { ...data };
      if (data.expediaPassword) {
        encryptedData.expediaPassword = this.encryptionUtil.encryptPassword(
          data.expediaPassword,
        );
      }
      if (data.agodaPassword) {
        encryptedData.agodaPassword = this.encryptionUtil.encryptPassword(
          data.agodaPassword,
        );
      }
      if (data.bookingPassword) {
        encryptedData.bookingPassword = this.encryptionUtil.encryptPassword(
          data.bookingPassword,
        );
      }

      Object.keys(encryptedData).forEach((key) => {
        if (!encryptedData[key]) {
          delete encryptedData[key];
        }
      });

      const credentials = await this.repository.update(id, encryptedData);
      return credentials;
    } catch (error) {
      this.logger.error(
        `Error updating property credentials: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async deletePropertyCredentials(id: string): Promise<PropertyCredentials> {
    try {
      const credentials = await this.repository.delete(id);
      return credentials;
    } catch (error) {
      this.logger.error(
        `Error deleting property credentials: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async bulkUpdatePropertyCredentials(
    data: BulkUpdatePropertyCredentialsDto,
  ): Promise<{ success: PropertyCredentials[]; failed: any[] }> {
    try {
      // Filter out empty strings and encrypt passwords before bulk update
      const encryptedCredentials = { ...data.credentials };

      // Only encrypt non-empty passwords
      if (
        data.credentials.expediaPassword &&
        data.credentials.expediaPassword.trim() !== ''
      ) {
        encryptedCredentials.expediaPassword =
          this.encryptionUtil.encryptPassword(data.credentials.expediaPassword);
      } else {
        // Remove empty password fields
        delete encryptedCredentials.expediaPassword;
      }

      if (
        data.credentials.agodaPassword &&
        data.credentials.agodaPassword.trim() !== ''
      ) {
        encryptedCredentials.agodaPassword =
          this.encryptionUtil.encryptPassword(data.credentials.agodaPassword);
      } else {
        delete encryptedCredentials.agodaPassword;
      }

      if (
        data.credentials.bookingPassword &&
        data.credentials.bookingPassword.trim() !== ''
      ) {
        encryptedCredentials.bookingPassword =
          this.encryptionUtil.encryptPassword(data.credentials.bookingPassword);
      } else {
        delete encryptedCredentials.bookingPassword;
      }

      // Filter out empty string values
      Object.keys(encryptedCredentials).forEach((key) => {
        if (
          encryptedCredentials[key] === '' ||
          encryptedCredentials[key] === null ||
          encryptedCredentials[key] === undefined
        ) {
          delete encryptedCredentials[key];
        }
      });

      // Check if we have any credentials to update
      if (Object.keys(encryptedCredentials).length === 0) {
        throw new Error(
          'No valid credentials provided. All fields are empty or null.',
        );
      }

      this.logger.log(
        `Filtered credentials: ${JSON.stringify(encryptedCredentials)}`,
      );

      // Pass only the necessary data to repository
      const bulkUpdateData = {
        propertyIds: data.propertyIds,
        credentials: encryptedCredentials,
      };

      const result = await this.repository.bulkUpdate(bulkUpdateData);

      this.logger.log(
        `Bulk update completed. Success: ${result.success.length}, Failed: ${result.failed.length}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Error in bulk update property credentials: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
