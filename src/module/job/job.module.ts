import { Module, Logger } from '@nestjs/common';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { JobRepository } from './job.repository';
import { DatabaseService } from '../database/database.service';

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
    DatabaseService,
    Logger,
  ],
  exports: ['IJobService'],
})
export class JobModule {}