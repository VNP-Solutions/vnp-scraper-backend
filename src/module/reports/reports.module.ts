import { Logger, Module } from '@nestjs/common';
import { MailService } from '../../common/utils/mail.service';
import { S3UploadService } from '../../common/utils/s3-upload.util';
import { DatabaseService } from '../database/database.service';
import { JobModule } from '../job/job.module';
import { ReportsExportConsumer } from './reports-export.consumer';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

@Module({
  imports: [JobModule],
  controllers: [ReportsController],
  providers: [
    {
      provide: 'IReportsService',
      useClass: ReportsService,
    },
    {
      provide: 'IReportsRepository',
      useClass: ReportsRepository,
    },
    // Async-export pipeline (SQS-backed). The consumer registers an
    // OnApplicationBootstrap lifecycle hook and starts long-polling
    // automatically when the app boots. If REPORTS_EXPORT_QUEUE_URL is
    // not set, the consumer logs a warning and stays idle — the
    // controller will then keep serving every export synchronously.
    MailService,
    S3UploadService,
    ReportsExportConsumer,
    DatabaseService,
    Logger,
  ],
  exports: ['IReportsService', 'IReportsRepository'],
})
export class ReportsModule {}
