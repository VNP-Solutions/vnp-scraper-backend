import { Inject, Injectable } from '@nestjs/common';
import { UserFeatureAccessPermission } from '@prisma/client';
import { UserFeatureAccessPermissionDto } from './user-feature-access-permission.dto';
import {
  IUserFeatureAccessPermissionRepository,
  IUserFeatureAccessPermissionService,
} from './user-feature-access-permission.interface';

@Injectable()
export class UserFeatureAccessPermissionService
  implements IUserFeatureAccessPermissionService
{
  constructor(
    @Inject('IUserFeatureAccessPermissionRepository')
    private readonly userFeatureAccessPermissionRepository: IUserFeatureAccessPermissionRepository,
  ) {}

  async createOrUpdateUserFeatureAccessPermission(
    data: UserFeatureAccessPermissionDto[],
  ): Promise<UserFeatureAccessPermission[]> {
    const results = [];
    for (const permissionData of data) {
      const permission =
        await this.userFeatureAccessPermissionRepository.createOrUpdate(
          permissionData,
        );
      results.push(permission);
    }
    return results;
  }

  async getAllUserFeatureAccessPermissions(): Promise<
    UserFeatureAccessPermission[]
  > {
    return this.userFeatureAccessPermissionRepository.findAll();
  }

  async getUserFeatureAccessPermissionById(
    id: string,
  ): Promise<UserFeatureAccessPermission> {
    return this.userFeatureAccessPermissionRepository.findById(id);
  }

  async getUserFeatureAccessPermissionByUserAndFeatureId(
    userId: string,
    featureId: object,
  ): Promise<UserFeatureAccessPermission> {
    return this.userFeatureAccessPermissionRepository.findByUserIdAndFeatureId(
      userId,
      featureId,
    );
  }

  async deleteUserFeatureAccessPermission(
    id: string,
  ): Promise<UserFeatureAccessPermission> {
    return this.userFeatureAccessPermissionRepository.delete(id);
  }
}
