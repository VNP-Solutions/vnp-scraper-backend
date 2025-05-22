import { Module, Logger } from '@nestjs/common';
import { UserFeatureAccessPermissionService } from './user-feature-access-permission.service';
import { UserFeatureAccessPermissionRepository } from './user-feature-access-permission.repository';
import { UserFeatureAccessPermissionController } from './user-feature-access-permission.controller';
import { DatabaseService } from '../database/database.service';

@Module({
  imports: [],
  controllers: [UserFeatureAccessPermissionController],
  providers: [
    {
      provide: 'IUserFeatureAccessPermissionService',
      useClass: UserFeatureAccessPermissionService,
    },
    {
      provide: 'IUserFeatureAccessPermissionRepository',
      useClass: UserFeatureAccessPermissionRepository,
    },
    DatabaseService,
    Logger,
  ],
  exports: [
    'IUserFeatureAccessPermissionService',
    'IUserFeatureAccessPermissionRepository',
  ],
})
export class UserFeatureAccessPermissionModule {}
