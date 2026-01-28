import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GoogleOAuthSchedulerService } from './google-oauth-scheduler.service';
import { GoogleOAuthConfig } from './google-oauth.config';
import { GoogleOAuthController } from './google-oauth.controller';
import { GoogleOAuthRepository } from './google-oauth.repository';
import { GoogleOAuthService } from './google-oauth.service';

@Module({
  imports: [ConfigModule],
  controllers: [GoogleOAuthController],
  providers: [
    GoogleOAuthConfig,
    GoogleOAuthService,
    GoogleOAuthSchedulerService,
    {
      provide: 'IGoogleOAuthRepository',
      useClass: GoogleOAuthRepository,
    },
  ],
  exports: [GoogleOAuthService, GoogleOAuthConfig],
})
export class GoogleOAuthModule {}
