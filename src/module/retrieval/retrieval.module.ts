import { Logger, Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PropertyModule } from '../property/property.module';
import { RetrievalController } from './retrieval.controller';
import { RetrievalRepository } from './retrieval.repository';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [PropertyModule],
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
    DatabaseService,
    Logger,
  ],
  exports: ['IRetrievalService'],
})
export class RetrievalModule {}
