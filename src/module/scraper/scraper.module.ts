import { HttpModule } from '@nestjs/axios';
import { Logger, Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as https from 'https';
import { DatabaseService } from '../database/database.service';
import { JobModule } from '../job/job.module';
import { RecurringJobModule } from '../recurring-job/recurring-job.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { ScheduledJobSchedulerService } from './scheduled-job-scheduler.service';
import { ScheduledJobRepository } from './scheduled-job.repository';
import { ScheduledJobService } from './scheduled-job.service';
import { ScraperJobItemRepository } from './scraper-job-item.repository';
import { ScraperJobItemService } from './scraper-job-item.service';
import { ScraperController } from './scraper.controller';

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
    RetrievalModule,
  ],
  controllers: [ScraperController],
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
  ],
  exports: ['IScheduledJobService'],
})
export class ScraperModule {}
