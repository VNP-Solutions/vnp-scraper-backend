import { Injectable, Logger } from '@nestjs/common';
import { PropertyCredentials } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
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
      const credentials = await this.db.propertyCredentials.create({
        data,
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
}
