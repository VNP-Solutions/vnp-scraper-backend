import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IGoogleOAuthRepository } from './google-oauth.interface';

@Injectable()
export class GoogleOAuthSchedulerService {
  private readonly logger = new Logger(GoogleOAuthSchedulerService.name);

  constructor(
    @Inject('IGoogleOAuthRepository')
    private readonly repository: IGoogleOAuthRepository,
  ) {}

  // Runs at 01:28 AM (local time +06:00) on January 29, 2026
  // Cron format: second minute hour day month dayOfWeek
  // 01:28 AM in +06:00 timezone = 19:28 UTC on Jan 28
  // @Cron('0 59 2 29 1 *') // 19:28 UTC on Jan 28 = 01:28 AM Jan 29 in +06:00 timezone
  @Cron(CronExpression.EVERY_12_HOURS) // Runs every 12 hours
  async handleTokenRefresh() {
    this.logger.log('Starting Google OAuth token refresh job (runs every 12 hours)...');

    try {
      // Load token from S3
      const tokenData = await this.repository.loadTokenFromS3();

      if (!tokenData) {
        this.logger.warn(
          'No Google OAuth token found in S3. Please authenticate first by visiting /api/google-oauth/auth',
        );
        return;
      }

      if (!tokenData.refresh_token) {
        this.logger.error(
          'No refresh token available. Re-authentication required.',
        );
        return;
      }

      // Check if token needs refresh
      if (!this.repository.needsTokenRefresh(tokenData)) {
        this.logger.log(
          'Token is still valid and does not need refresh at this time',
        );
        return;
      }

      // Refresh the token
      this.logger.log('Token is expiring soon, refreshing...');
      const newTokenData = await this.repository.refreshToken(
        tokenData.refresh_token,
      );

      // Save the new token to S3
      await this.repository.saveTokenToS3(newTokenData);

      this.logger.log(
        'Google OAuth token refresh job completed successfully. New token saved to S3.',
      );
    } catch (error: any) {
      this.logger.error(
        `Error during Google OAuth token refresh: ${error.message}`,
        error.stack,
      );
    }
  }

  // Manual trigger method for testing
  async triggerTokenRefresh() {
    this.logger.log('Manually triggering Google OAuth token refresh...');
    await this.handleTokenRefresh();
  }
}
