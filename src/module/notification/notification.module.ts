import { Logger, Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';

@Module({
  controllers: [NotificationController],
  providers: [
    {
      provide: 'INotificationService',
      useClass: NotificationService,
    },
    {
      provide: 'INotificationRepository',
      useClass: NotificationRepository,
    },
    Logger,
  ],
  exports: ['INotificationService'],
})
export class NotificationModule {}
