import { Logger, Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { JobModule } from '../job/job.module';
import { ScraperModule } from '../scraper/scraper.module';
import { ServerModule } from '../server/server.module';
import { RecurringJobController } from './recurring-job.controller';
import { RecurringJobRepository } from './recurring-job.repository';
import { RecurringJobService } from './recurring-job.service';

@Module({
  imports: [
    forwardRef(() => JobModule),
    forwardRef(() => ScraperModule),
    ServerModule,
  ],
  controllers: [RecurringJobController],
  providers: [
    {
      provide: 'IRecurringJobService',
      useClass: RecurringJobService,
    },
    {
      provide: 'IRecurringJobRepository',
      useClass: RecurringJobRepository,
    },
    DatabaseService,
    Logger,
    ConfigService,
  ],
  exports: ['IRecurringJobService'],
})
export class RecurringJobModule {}
