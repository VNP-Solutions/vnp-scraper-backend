import { Logger, Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { PropertyCredentialsModule } from '../property-credentials/property-credentials.module';
import { PropertyModule } from '../property/property.module';
import { RecurringJobModule } from '../recurring-job/recurring-job.module';
import { ExternalJwtGuard } from '../qa-panel/guards/external-jwt.guard';
import { RetrievalController } from './retrieval.controller';
import { RetrievalRepository } from './retrieval.repository';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [
    ConfigModule,
    PropertyModule,
    PropertyCredentialsModule,
    forwardRef(() => RecurringJobModule),
  ],
  controllers: [RetrievalController],
  providers: [
    {
      provide: 'IRetrievalService',
      useClass: RetrievalService,
    },
    {
      provide: 'IRetrievalRepository',
      useClass: RetrievalRepository,
    },
    ExternalJwtGuard,
    DatabaseService,
    Logger,
  ],
  exports: ['IRetrievalService'],
})
export class RetrievalModule {}
