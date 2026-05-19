import { Logger, Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { JobModule } from '../job/job.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

@Module({
  imports: [JobModule, RetrievalModule],
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
    DatabaseService,
    Logger,
  ],
  exports: ['IReportsService', 'IReportsRepository'],
})
export class ReportsModule {}
