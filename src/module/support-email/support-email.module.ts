import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { S3UploadService } from '../../common/utils/s3-upload.util';
import { DatabaseService } from '../database/database.service';
import { GoogleOAuthModule } from '../google-oauth/google-oauth.module';
import { JobModule } from '../job/job.module';
import { PropertyModule } from '../property/property.module';
import { AttachmentParserService } from './attachment-parser.service';
import { SupportEmailController } from './support-email.controller';
import { SupportEmailRepository } from './support-email.repository';
import { SupportEmailScraperService } from './support-email-scraper.service';
import { SupportEmailService } from './support-email.service';

@Module({
  imports: [ConfigModule, JwtModule.register({}), GoogleOAuthModule, JobModule, PropertyModule],
  controllers: [SupportEmailController],
  providers: [
    {
      provide: 'ISupportEmailService',
      useClass: SupportEmailService,
    },
    {
      provide: 'ISupportEmailScraperService',
      useClass: SupportEmailScraperService,
    },
    {
      provide: 'ISupportEmailRepository',
      useClass: SupportEmailRepository,
    },
    AttachmentParserService,
    S3UploadService,
    DatabaseService,
    Logger,
  ],
  exports: ['ISupportEmailService', 'ISupportEmailScraperService'],
})
export class SupportEmailModule {}
