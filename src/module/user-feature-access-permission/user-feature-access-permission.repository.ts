import { Injectable, Logger } from '@nestjs/common';
import { UserFeatureAccessPermission } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { UserFeatureAccessPermissionDto } from './user-feature-access-permission.dto';
import { IUserFeatureAccessPermissionRepository } from './user-feature-access-permission.interface';

@Injectable()
export class UserFeatureAccessPermissionRepository
  implements IUserFeatureAccessPermissionRepository
{
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

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

  async createOrUpdate(
    data: UserFeatureAccessPermissionDto,
  ): Promise<UserFeatureAccessPermission> {
    try {
      // First find if a permission already exists
      const existingPermission =
        await this.db.userFeatureAccessPermission.findFirst({
          where: {
            user_id: data.user_id,
            portfolio_id: data.portfolio_id || null,
            sub_portfolio_id: data.sub_portfolio_id || null,
            property_id: data.property_id || null,
          },
        });

      if (existingPermission) {
        // Update existing permission
        return this.db.userFeatureAccessPermission.update({
          where: { id: existingPermission.id },
          data: {
            user_id: data.user_id,
            portfolio_id: data.portfolio_id,
            sub_portfolio_id: data.sub_portfolio_id,
            property_id: data.property_id,
          },
        });
      } else {
        // Create new permission
        return this.db.userFeatureAccessPermission.create({
          data: {
            user_id: data.user_id,
            portfolio_id: data.portfolio_id,
            sub_portfolio_id: data.sub_portfolio_id,
            property_id: data.property_id,
          },
        });
      }
    } catch (error) {
      this.logger.error('Error in createOrUpdate:', error);
      throw error;
    }
  }
}
