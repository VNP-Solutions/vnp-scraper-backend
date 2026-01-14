import { Logger, Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import { DatabaseService } from '../database/database.service';
import { PropertyRepository } from '../property/property.repository';
import { ScraperModule } from '../scraper/scraper.module';
import { JobController } from './job.controller';
import { JobRepository } from './job.repository';
import { JobService } from './job.service';

@Module({
  imports: [forwardRef(() => ScraperModule)],
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
    {
      provide: 'IPropertyRepository',
      useClass: PropertyRepository,
    },
    DatabaseService,
    Logger,
    EncryptionUtil,
    ConfigService,
  ],
  exports: ['IJobService'],
})
export class JobModule {}
