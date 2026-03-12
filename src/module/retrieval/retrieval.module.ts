import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { PropertyCredentialsModule } from '../property-credentials/property-credentials.module';
import { PropertyModule } from '../property/property.module';
import { RetrievalController } from './retrieval.controller';
import { RetrievalRepository } from './retrieval.repository';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [ConfigModule, PropertyModule, PropertyCredentialsModule],
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
