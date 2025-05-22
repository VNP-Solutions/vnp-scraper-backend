import { Inject, Injectable } from '@nestjs/common';
import { UserFeatureAccessPermission } from '@prisma/client';
import {
  CreateUserFeatureAccessPermissionDto,
  UpdateUserFeatureAccessPermissionDto,
} from './user-feature-access-permission.dto';
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

  async createUserFeatureAccessPermission(
    data: CreateUserFeatureAccessPermissionDto,
  ): Promise<UserFeatureAccessPermission> {
    return this.userFeatureAccessPermissionRepository.create(data);
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

  async updateUserFeatureAccessPermission(
    id: string,
    data: UpdateUserFeatureAccessPermissionDto,
  ): Promise<UserFeatureAccessPermission> {
    return this.userFeatureAccessPermissionRepository.update(id, data);
  }

  async deleteUserFeatureAccessPermission(
    id: string,
  ): Promise<UserFeatureAccessPermission> {
    return this.userFeatureAccessPermissionRepository.delete(id);
  }
}
