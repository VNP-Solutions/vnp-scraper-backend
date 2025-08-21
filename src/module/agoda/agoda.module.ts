import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as https from 'https';
import { JobModule } from '../job/job.module';
import { AgodaController } from './agoda.controller';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        timeout: 300000, // 5 minutes timeout
        maxRedirects: 5,
        httpsAgent: new https.Agent({
          rejectUnauthorized: configService.get('NODE_ENV') === 'production', // Allow self-signed certs in dev
          keepAlive: true,
          timeout: 300000,
        }),
        // Additional axios configuration for better HTTPS handling
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      }),
      inject: [ConfigService],
    }),
    ConfigModule,
    JobModule,
  ],
  controllers: [AgodaController],
  providers: [],
})
export class AgodaModule {}
