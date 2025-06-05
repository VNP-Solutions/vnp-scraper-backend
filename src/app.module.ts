import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './module/auth/auth.module';
import { JobModule } from './module/job/job.module';
import { PortfolioModule } from './module/portfolio/portfolio.module';
import { PropertyCredentialsModule } from './module/property-credentials/property-credentials.module';
import { PropertyModule } from './module/property/property.module';
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
    AuthModule,
    UserModule,
    PortfolioModule,
    PropertyCredentialsModule,
    PropertyModule,
    SubPortfolioModule,
    JobModule,
    UploadModule,
    UserFeatureAccessPermissionModule,
    UserInvitationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
