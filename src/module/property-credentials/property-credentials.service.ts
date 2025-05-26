import { Inject, Injectable, Logger } from '@nestjs/common';
import { PropertyCredentials } from '@prisma/client';
import {
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
  ) {}

  async createPropertyCredentials(
    data: CreatePropertyCredentialsDto,
  ): Promise<PropertyCredentials> {
    try {
      const credentials = await this.repository.create(data);
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
      const credentials = await this.repository.update(id, data);
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
}
