import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { UserFeatureAccessPermissionModule } from '../user-feature-access-permission/user-feature-access-permission.module';
import { UserModule } from '../user/user.module';
import { UserInvitationController } from './user-invitation.controller';
import { UserInvitationRepository } from './user-invitation.repository';
import { UserInvitationService } from './user-invitation.service';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    UserModule,
    UserFeatureAccessPermissionModule,
  ],
  controllers: [UserInvitationController],
  providers: [
    {
      provide: 'IUserInvitationRepository',
      useClass: UserInvitationRepository,
    },
    {
      provide: 'IUserInvitationService',
      useClass: UserInvitationService,
    },
    Logger,
  ],
  exports: [
    {
      provide: 'IUserInvitationService',
      useClass: UserInvitationService,
    },
    {
      provide: 'IUserInvitationRepository',
      useClass: UserInvitationRepository,
    },
  ],
})
export class UserInvitationModule {}
