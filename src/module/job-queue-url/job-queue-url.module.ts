import { Logger, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { JobQueueUrlController } from './job-queue-url.controller';
import { JobQueueUrlRepository } from './job-queue-url.repository';
import { JobQueueUrlService } from './job-queue-url.service';

@Module({
  imports: [DatabaseModule],
  controllers: [JobQueueUrlController],
  providers: [
    Logger,
    {
      provide: 'IJobQueueUrlRepository',
      useClass: JobQueueUrlRepository,
    },
    {
      provide: 'IJobQueueUrlService',
      useClass: JobQueueUrlService,
    },
  ],
  exports: ['IJobQueueUrlRepository', 'IJobQueueUrlService'],
})
export class JobQueueUrlModule {}
