import { Injectable, Logger } from '@nestjs/common';
import { PropertyCredentials } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  BulkUpdatePropertyCredentialsDto,
  CreatePropertyCredentialsDto,
  UpdatePropertyCredentialsDto,
} from './property-credentials.dto';
import { IPropertyCredentialsRepository } from './property-credentials.interface';

@Injectable()
export class PropertyCredentialsRepository
  implements IPropertyCredentialsRepository
{
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  get databaseService(): DatabaseService {
    return this.db;
  }

  async create(
    data: CreatePropertyCredentialsDto,
  ): Promise<PropertyCredentials> {
    try {
      const { property_id, ...credentialsData } = data;

      if (!property_id) {
        this.logger.error('property_id is required');
        return null;
      }

      const credentials = await this.db.propertyCredentials.create({
        data: {
          ...credentialsData,
          property: {
            connect: {
              id: property_id,
            },
          },
        },
      });
      return credentials;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findAll(): Promise<PropertyCredentials[]> {
    try {
      const credentials = await this.db.propertyCredentials.findMany();
      return credentials;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findById(id: string): Promise<PropertyCredentials> {
    try {
      const credentials = await this.db.propertyCredentials.findUnique({
        where: {
          id,
        },
      });
      return credentials;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findByPropertyId(
    propertyId: string,
  ): Promise<PropertyCredentials | null> {
    try {
      const credentials = await this.db.propertyCredentials.findFirst({
        where: {
          property_id: propertyId,
        },
      });
      return credentials;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async update(
    id: string,
    data: UpdatePropertyCredentialsDto,
  ): Promise<PropertyCredentials> {
    try {
      const credentials = await this.db.propertyCredentials.update({
        where: {
          id,
        },
        data,
      });
      return credentials;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async delete(id: string): Promise<PropertyCredentials> {
    try {
      const credentials = await this.db.propertyCredentials.delete({
        where: {
          id,
        },
      });
      return credentials;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async updateProperty(id: string, data: any): Promise<any> {
    try {
      const property = await this.db.property.update({
        where: { id },
        data,
      });
      return property;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async bulkUpdate(
    data: BulkUpdatePropertyCredentialsDto,
  ): Promise<{ success: PropertyCredentials[]; failed: any[] }> {
    const success: PropertyCredentials[] = [];
    const failed: any[] = [];

    try {
      this.logger.log(
        `Starting bulk update for ${data.propertyIds.length} properties`,
      );
      this.logger.log(`Credentials data: ${JSON.stringify(data.credentials)}`);

      for (const propertyId of data.propertyIds) {
        try {
          this.logger.log(`Processing property: ${propertyId}`);

          // Check if property credentials already exist for this property
          const existingCredential =
            await this.db.propertyCredentials.findFirst({
              where: { property_id: propertyId },
            });

          let updatedCredential: PropertyCredentials;

          if (existingCredential) {
            this.logger.log(
              `Updating existing credentials for property ${propertyId}`,
            );
            this.logger.log(`Update data: ${JSON.stringify(data.credentials)}`);
            // Update existing credentials
            updatedCredential = await this.db.propertyCredentials.update({
              where: { id: existingCredential.id },
              data: data.credentials,
            });
            this.logger.log(
              `Successfully updated credentials for property ${propertyId}`,
            );
          } else {
            this.logger.log(
              `Creating new credentials for property ${propertyId}`,
            );
            // Create new credentials for this property
            const createData = {
              ...data.credentials,
              property_id: propertyId,
            };
            this.logger.log(`Create data: ${JSON.stringify(createData)}`);
            updatedCredential = await this.db.propertyCredentials.create({
              data: createData,
            });
            this.logger.log(
              `Successfully created credentials for property ${propertyId}`,
            );
          }

          success.push(updatedCredential);
        } catch (error) {
          this.logger.error(
            `Error processing property ${propertyId}: ${error.message}`,
          );
          failed.push({
            propertyId,
            error: error.message,
          });
        }
      }

      this.logger.log(
        `Bulk update completed. Success: ${success.length}, Failed: ${failed.length}`,
      );
      return { success, failed };
    } catch (error) {
      this.logger.error(`Error in bulk update: ${error.message}`, error.stack);
      throw error;
    }
  }
}
