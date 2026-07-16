import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailService } from '../../common/utils/mail.service';
import { S3UploadService } from '../../common/utils/s3-upload.util';
import { DatabaseService } from '../database/database.service';
import { OtaPostPreChargingExportConsumer } from './ota-post-pre-charging-export.consumer';
import { OtaPostPreChargingController } from './ota-post-pre-charging.controller';
import { OtaPostPreChargingRepository } from './ota-post-pre-charging.repository';
import { OtaPostPreChargingService } from './ota-post-pre-charging.service';

@Module({
  imports: [ConfigModule],
  controllers: [OtaPostPreChargingController],
  providers: [
    OtaPostPreChargingRepository,
    S3UploadService,
    MailService,
    DatabaseService,
    OtaPostPreChargingExportConsumer,
    Logger,
    {
      provide: 'IOtaPostPreChargingService',
      useClass: OtaPostPreChargingService,
    },
    {
      provide: 'IOtaPostPreChargingRepository',
      useClass: OtaPostPreChargingRepository,
    },
  ],
  exports: ['IOtaPostPreChargingService', 'IOtaPostPreChargingRepository'],
})
export class OtaPostPreChargingModule {}
