import { UserFeatureAccessPermission } from '@prisma/client';
import {
  CreateUserFeatureAccessPermissionDto,
  UpdateUserFeatureAccessPermissionDto,
} from './user-feature-access-permission.dto';

export interface IUserFeatureAccessPermissionRepository {
  create(
    data: CreateUserFeatureAccessPermissionDto,
  ): Promise<UserFeatureAccessPermission>;
  findAll(): Promise<UserFeatureAccessPermission[]>;
  findById(id: string): Promise<UserFeatureAccessPermission>;
  findByUserIdAndFeatureId(
    userId: string,
    featureId: object,
  ): Promise<UserFeatureAccessPermission>;
  update(
    id: string,
    data: UpdateUserFeatureAccessPermissionDto,
  ): Promise<UserFeatureAccessPermission>;
  delete(id: string): Promise<UserFeatureAccessPermission>;
}

export interface IUserFeatureAccessPermissionService {
  createUserFeatureAccessPermission(
    data: CreateUserFeatureAccessPermissionDto,
  ): Promise<UserFeatureAccessPermission>;
  getAllUserFeatureAccessPermissions(): Promise<UserFeatureAccessPermission[]>;
  getUserFeatureAccessPermissionById(
    id: string,
  ): Promise<UserFeatureAccessPermission>;
  getUserFeatureAccessPermissionByUserAndFeatureId(
    userId: string,
    featureId: object,
  ): Promise<UserFeatureAccessPermission>;
  updateUserFeatureAccessPermission(
    id: string,
    data: UpdateUserFeatureAccessPermissionDto,
  ): Promise<UserFeatureAccessPermission>;
  deleteUserFeatureAccessPermission(
    id: string,
  ): Promise<UserFeatureAccessPermission>;
}
