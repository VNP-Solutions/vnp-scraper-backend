import { HttpModule } from '@nestjs/axios';
import { Logger, Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import * as https from 'https';
import { DatabaseService } from '../database/database.service';
import { PropertyCredentialsModule } from '../property-credentials/property-credentials.module';
import { PropertyModule } from '../property/property.module';
import { RecurringJobModule } from '../recurring-job/recurring-job.module';
import { ExternalJwtGuard } from '../qa-panel/guards/external-jwt.guard';
import { RetrievalRunDispatchService } from './retrieval-run-dispatch.service';
import { RetrievalController } from './retrieval.controller';
import { RetrievalRepository } from './retrieval.repository';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        timeout: 300000,
        maxRedirects: 5,
        httpsAgent: new https.Agent({
          rejectUnauthorized: configService.get('NODE_ENV') === 'production',
          keepAlive: true,
          timeout: 300000,
        }),
      }),
      inject: [ConfigService],
    }),
    ConfigModule,
    JwtModule.register({}),
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
    RetrievalRunDispatchService,
  ],
  exports: ['IRetrievalService', RetrievalRunDispatchService],
})
export class RetrievalModule {}
