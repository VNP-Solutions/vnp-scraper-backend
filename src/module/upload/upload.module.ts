import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { S3UploadService } from '../../common/utils/s3-upload.util';
import { UploadRepository } from './upload.repository';
import { DatabaseService } from '../database/database.service';

@Module({
  imports: [ConfigModule],
  controllers: [UploadController],
  providers: [
    {
      provide: 'IUploadService',
      useClass: UploadService,
    },
    {
      provide: 'IUploadRepository',
      useClass: UploadRepository,
    },
    S3UploadService,
    DatabaseService,
    Logger,
  ],
  exports: ['IUploadService'],
})
export class UploadModule {}