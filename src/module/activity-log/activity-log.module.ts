import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { S3UploadService } from '../../common/utils/s3-upload.util';
import { ActivityLogExportModule } from '../activity-log-export/activity-log-export.module';
import { ActivityLogSchedulerService } from './activity-log-scheduler.service';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogRepository } from './activity-log.repository';
import { ActivityLogService } from './activity-log.service';

@Module({
  imports: [ConfigModule, ActivityLogExportModule],
  controllers: [ActivityLogController],
  providers: [
    ActivityLogService,
    ActivityLogSchedulerService,
    S3UploadService,
    {
      provide: 'IActivityLogRepository',
      useClass: ActivityLogRepository,
    },
    {
      provide: 'IActivityLogService',
      useClass: ActivityLogService,
    },
  ],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
