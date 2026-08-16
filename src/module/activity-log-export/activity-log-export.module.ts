import { Logger, Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ActivityLogExportController } from './activity-log-export.controller';
import { ActivityLogExportRepository } from './activity-log-export.repository';
import { ActivityLogExportService } from './activity-log-export.service';

@Module({
  controllers: [ActivityLogExportController],
  providers: [
    {
      provide: 'IActivityLogExportService',
      useClass: ActivityLogExportService,
    },
    {
      provide: 'IActivityLogExportRepository',
      useClass: ActivityLogExportRepository,
    },
    DatabaseService,
    Logger,
  ],
  exports: ['IActivityLogExportService'],
})
export class ActivityLogExportModule {}
