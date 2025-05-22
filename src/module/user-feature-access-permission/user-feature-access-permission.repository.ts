import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { UserFeatureAccessPermission } from '@prisma/client';
import {
  CreateUserFeatureAccessPermissionDto,
  UpdateUserFeatureAccessPermissionDto,
} from './user-feature-access-permission.dto';
import { IUserFeatureAccessPermissionRepository } from './user-feature-access-permission.interface';

@Injectable()
export class UserFeatureAccessPermissionRepository
  implements IUserFeatureAccessPermissionRepository
{
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  async create(
    data: CreateUserFeatureAccessPermissionDto,
  ): Promise<UserFeatureAccessPermission> {
    try {
      return this.db.userFeatureAccessPermission.create({
        data,
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findAll(): Promise<UserFeatureAccessPermission[]> {
    try {
      return this.db.userFeatureAccessPermission.findMany();
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findById(id: string): Promise<UserFeatureAccessPermission> {
    try {
      return this.db.userFeatureAccessPermission.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findByUserIdAndFeatureId(
    userId: string,
    featureId: object,
  ): Promise<UserFeatureAccessPermission> {
    try {
      return this.db.userFeatureAccessPermission.findFirst({
        where: {
          user_id: userId,
          ...featureId,
        },
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async update(
    id: string,
    data: UpdateUserFeatureAccessPermissionDto,
  ): Promise<UserFeatureAccessPermission> {
    try {
      return this.db.userFeatureAccessPermission.update({
        where: { id },
        data,
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async delete(id: string): Promise<UserFeatureAccessPermission> {
    try {
      return this.db.userFeatureAccessPermission.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }
}
