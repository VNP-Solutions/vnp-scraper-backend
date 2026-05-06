import { Logger, Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import { DatabaseService } from '../database/database.service';
import { PropertyModule } from '../property/property.module';
import { RecurringJobModule } from '../recurring-job/recurring-job.module';
import { ScraperModule } from '../scraper/scraper.module';
import { ServerModule } from '../server/server.module';
import { JobController } from './job.controller';
import { JobRepository } from './job.repository';
import { JobService } from './job.service';

@Module({
  imports: [
    
    forwardRef(() => ScraperModule),
   
    forwardRef(() => RecurringJobModule),
    PropertyModule,
    ServerModule,
  ],
  controllers: [JobController],
  providers: [
    {
      provide: 'IJobService',
      useClass: JobService,
    },
    {
      provide: 'IJobRepository',
      useClass: JobRepository,
    },
    DatabaseService,
    Logger,
    EncryptionUtil,
    ConfigService,
  ],
  exports: ['IJobService', 'IJobRepository'],
})
export class JobModule {}
