import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import { DatabaseService } from '../database/database.service';
import { PropertyRepository } from '../property/property.repository';
import { JobController } from './job.controller';
import { JobRepository } from './job.repository';
import { JobService } from './job.service';

@Module({
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
