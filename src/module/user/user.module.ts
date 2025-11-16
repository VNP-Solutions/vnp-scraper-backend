import { Logger, Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { DatabaseService } from './../database/database.service';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';

@Module({
  imports: [NotificationModule],
  controllers: [UserController],
  providers: [
    {
      provide: 'IUserService',
      useClass: UserService,
    },
    {
      provide: 'IUserRepository',
      useClass: UserRepository,
    },
    DatabaseService,
    Logger,
  ],
  exports: ['IUserService', 'IUserRepository'],
})
export class UserModule {}
