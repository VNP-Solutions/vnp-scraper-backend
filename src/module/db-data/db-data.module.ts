import { Logger, Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DbDataController } from './db-data.controller';
import { DbDataRepository } from './db-data.repository';
import { DbDataService } from './db-data.service';

@Module({
  imports: [],
  controllers: [DbDataController],
  providers: [
    {
      provide: 'IDbDataService',
      useClass: DbDataService,
    },
    {
      provide: 'IDbDataRepository',
      useClass: DbDataRepository,
    },
    DatabaseService,
    Logger,
  ],
  exports: ['IDbDataService', 'IDbDataRepository'],
})
export class DbDataModule {}
