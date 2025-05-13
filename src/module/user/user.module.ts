import { DatabaseService } from './../database/database.service';
import { Logger, Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';

@Module({
  imports: [],
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
