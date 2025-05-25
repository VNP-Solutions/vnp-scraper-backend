import { Injectable, Logger } from '@nestjs/common';
import { Property } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { CreatePropertyDto, UpdatePropertyDto } from './property.dto';
import { IPropertyRepository } from './property.interface';

@Injectable()
export class PropertyRepository implements IPropertyRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  get databaseService(): DatabaseService {
    return this.db;
  }

  async create(data: CreatePropertyDto): Promise<Property> {
    try {
      const property = await this.db.property.create({
        data,
      });
      return property;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findAll(): Promise<Property[]> {
    try {
      const properties = await this.db.property.findMany({
        include: {
          credentials: true,
        },
      });
      return properties;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findById(id: string): Promise<Property> {
    try {
      const property = await this.db.property.findUnique({
        where: {
          id,
        },
        include: {
          credentials: true,
        },
      });
      return property;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async update(id: string, data: UpdatePropertyDto): Promise<Property> {
    try {
      const property = await this.db.property.update({
        where: {
          id,
        },
        data,
        include: {
          credentials: true,
        },
      });
      return property;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async delete(id: string): Promise<Property> {
    try {
      const property = await this.db.property.delete({
        where: {
          id,
        },
        include: {
          credentials: true,
        },
      });
      return property;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findPermission(id: string, userId: string): Promise<any> {
    return this.db.userFeatureAccessPermission.findFirst({
      where: {
        user_id: userId,
        property_id: id,
      },
    });
  }

  async findFilteredProperty(userId: string): Promise<any> {
    try {
      return this.db.property.findMany({
        where: {
          userFeatureAccessPermissions: {
            some: {
              user_id: userId,
            },
          },
        },
        include: {
          userFeatureAccessPermissions: true,
        },
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }
}
