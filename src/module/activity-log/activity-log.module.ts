import { Module } from '@nestjs/common';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogRepository } from './activity-log.repository';
import { ActivityLogService } from './activity-log.service';

@Module({
  controllers: [ActivityLogController],
  providers: [
    ActivityLogService,
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
