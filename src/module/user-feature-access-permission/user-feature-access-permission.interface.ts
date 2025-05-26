import { UserFeatureAccessPermission } from '@prisma/client';
import { UserFeatureAccessPermissionDto } from './user-feature-access-permission.dto';

export interface IUserFeatureAccessPermissionRepository {
  createOrUpdate(
    data: UserFeatureAccessPermissionDto,
  ): Promise<UserFeatureAccessPermission>;
  findAll(): Promise<UserFeatureAccessPermission[]>;
  findById(id: string): Promise<UserFeatureAccessPermission>;
  findByUserIdAndFeatureId(
    userId: string,
    featureId: object,
  ): Promise<UserFeatureAccessPermission>;
  delete(id: string): Promise<UserFeatureAccessPermission>;
}

export interface IUserFeatureAccessPermissionService {
  createOrUpdateUserFeatureAccessPermission(
    data: UserFeatureAccessPermissionDto[],
  ): Promise<UserFeatureAccessPermissionDto[]>;
  getAllUserFeatureAccessPermissions(): Promise<UserFeatureAccessPermission[]>;
  getUserFeatureAccessPermissionById(
    id: string,
  ): Promise<UserFeatureAccessPermission>;
  getUserFeatureAccessPermissionByUserAndFeatureId(
    userId: string,
    featureId: object,
  ): Promise<UserFeatureAccessPermission>;
  deleteUserFeatureAccessPermission(
    id: string,
  ): Promise<UserFeatureAccessPermission>;
}
