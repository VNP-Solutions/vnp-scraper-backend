import { HttpModule } from '@nestjs/axios';
import { Logger, Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as https from 'https';
import { DatabaseService } from '../database/database.service';
import { JobModule } from '../job/job.module';
import { PropertyCredentialsModule } from '../property-credentials/property-credentials.module';
import { RecurringJobModule } from '../recurring-job/recurring-job.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { ServerModule } from '../server/server.module';
import { BookingScraperUrlModule } from '../booking-scraper-url/booking-scraper-url.module';
import { BookingBulkDispatchService } from './booking-bulk-dispatch.service';
import { BookingRunController } from './booking-run.controller';
import { BookingRunService } from './booking-run.service';
import { BulkJobItemsImportConsumer } from './bulk-job-items-import.consumer';
import { LambdaTriggerSchedulerService } from './lambda-trigger-scheduler.service';
import { ScheduledJobSchedulerService } from './scheduled-job-scheduler.service';
import { ScheduledJobRepository } from './scheduled-job.repository';
import { ScheduledJobService } from './scheduled-job.service';
import { ScraperJobItemRepository } from './scraper-job-item.repository';
import { ScraperJobItemService } from './scraper-job-item.service';
import { ScraperController } from './scraper.controller';
import { MailService } from '../../common/utils/mail.service';
import { S3UploadService } from '../../common/utils/s3-upload.util';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        timeout: 300000, // 5 minutes timeout
        maxRedirects: 5,
        httpsAgent: new https.Agent({
          rejectUnauthorized: configService.get('NODE_ENV') === 'production', // Allow self-signed certs in dev
          keepAlive: true,
          timeout: 300000,
        }),
        // Additional axios configuration for better HTTPS handling
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      }),
      inject: [ConfigService],
    }),
    ConfigModule,
    forwardRef(() => JobModule),
    forwardRef(() => RecurringJobModule),
    ServerModule,
    BookingScraperUrlModule,
    RetrievalModule,
    PropertyCredentialsModule,
  ],
  controllers: [ScraperController, BookingRunController],
  providers: [
    {
      provide: 'IScraperJobItemService',
      useClass: ScraperJobItemService,
    },
    {
      provide: 'IScraperJobItemRepository',
      useClass: ScraperJobItemRepository,
    },
    {
      provide: 'IScheduledJobService',
      useClass: ScheduledJobService,
    },
    {
      provide: 'IScheduledJobRepository',
      useClass: ScheduledJobRepository,
    },
    DatabaseService,
    Logger,
    ScheduledJobSchedulerService,
    LambdaTriggerSchedulerService,
    BookingBulkDispatchService,
    BookingRunService,
    MailService,
    S3UploadService,
    BulkJobItemsImportConsumer,
  ],
  exports: ['IScheduledJobService'],
})
export class ScraperModule {}
