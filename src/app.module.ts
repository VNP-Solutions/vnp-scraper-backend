import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ActivityLoggerMiddleware } from './common/middleware/activity-logger.middleware';
import { ActivityLogExportModule } from './module/activity-log-export/activity-log-export.module';
import { ActivityLogModule } from './module/activity-log/activity-log.module';
import { AgodaModule } from './module/agoda/agoda.module';
import { AuthModule } from './module/auth/auth.module';
import { DatabaseModule } from './module/database/database.module';
import { DbDataModule } from './module/db-data/db-data.module';
import { GoogleOAuthModule } from './module/google-oauth/google-oauth.module';
import { JobModule } from './module/job/job.module';
import { NotificationModule } from './module/notification/notification.module';
import { OtpLogModule } from './module/otp-log/otp-log.module';
import { OtpStatusModule } from './module/otp-status/otp-status.module';
import { PortfolioModule } from './module/portfolio/portfolio.module';
import { PropertyCredentialsModule } from './module/property-credentials/property-credentials.module';
import { PropertyModule } from './module/property/property.module';
import { RecurringJobModule } from './module/recurring-job/recurring-job.module';
import { RetrievalModule } from './module/retrieval/retrieval.module';
import { ScraperModule } from './module/scraper/scraper.module';
import { SubPortfolioModule } from './module/sub-portfolio/sub-portfolio.module';
import { UploadModule } from './module/upload/upload.module';
import { UserFeatureAccessPermissionModule } from './module/user-feature-access-permission/user-feature-access-permission.module';
import { UserInvitationModule } from './module/user-invitation/user-invitation.module';
import { UserModule } from './module/user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    UserModule,
    PortfolioModule,
    PropertyCredentialsModule,
    PropertyModule,
    SubPortfolioModule,
    JobModule,
    RecurringJobModule,
    UploadModule,
    UserFeatureAccessPermissionModule,
    UserInvitationModule,
    ActivityLogModule,
    ActivityLogExportModule,
    OtpLogModule,
    ScraperModule,
    AgodaModule,
    OtpStatusModule,
    RetrievalModule,
    DbDataModule,
    NotificationModule,
    GoogleOAuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ActivityLoggerMiddleware).forRoutes('*');
  }
}
