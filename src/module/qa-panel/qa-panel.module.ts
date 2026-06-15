import { HttpModule } from '@nestjs/axios';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import * as https from 'https';
import { MailService } from '../../common/utils/mail.service';
import { S3UploadService } from '../../common/utils/s3-upload.util';
import { ExternalJwtGuard } from './guards/external-jwt.guard';
import { QaPanelController } from './qa-panel.controller';
import { QaPanelRepository } from './qa-panel.repository';
import { QaPanelService } from './qa-panel.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('JWT_COMMUNICATION_SECRET') ??
          configService.get<string>('JWT_COMMUNICATION_SECRET') ??
          configService.get<string>('SECRET_KEY'),
      }),
    }),
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
        validateStatus: (status) => status < 500,
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [QaPanelController],
  providers: [
    QaPanelRepository,
    S3UploadService,
    MailService,
    ExternalJwtGuard,
    Logger,
    {
      provide: 'IQaPanelService',
      useClass: QaPanelService,
    },
    {
      provide: 'IQaPanelRepository',
      useClass: QaPanelRepository,
    },
  ],
  exports: ['IQaPanelService', 'IQaPanelRepository'],
})
export class QaPanelModule {}
