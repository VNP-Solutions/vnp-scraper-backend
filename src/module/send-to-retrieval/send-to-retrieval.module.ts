import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AgodaCaseItemModule } from '../agoda-case-item/agoda-case-item.module';
import { DatabaseModule } from '../database/database.module';
import { JobModule } from '../job/job.module';
import { PropertyModule } from '../property/property.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { SupportEmailModule } from '../support-email/support-email.module';
import { SendToRetrievalController } from './send-to-retrieval.controller';
import { SendToRetrievalService } from './send-to-retrieval.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    JobModule,
    PropertyModule,
    SupportEmailModule,
    RetrievalModule,
    AgodaCaseItemModule,
    DatabaseModule,
  ],
  controllers: [SendToRetrievalController],
  providers: [
    {
      provide: 'ISendToRetrievalService',
      useClass: SendToRetrievalService,
    },
  ],
  exports: ['ISendToRetrievalService'],
})
export class SendToRetrievalModule {}
