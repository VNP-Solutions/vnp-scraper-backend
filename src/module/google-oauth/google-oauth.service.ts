import { Inject, Injectable, Logger } from '@nestjs/common';
import { GoogleOAuthConfig } from './google-oauth.config';
import {
    GoogleTokenData,
    IGoogleOAuthRepository,
    IGoogleOAuthService,
} from './google-oauth.interface';

@Injectable()
export class GoogleOAuthService implements IGoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(
    private readonly googleOAuthConfig: GoogleOAuthConfig,
    @Inject('IGoogleOAuthRepository')
    private readonly repository: IGoogleOAuthRepository,
  ) {}

  getAuthUrl(): string {
    return this.googleOAuthConfig.getAuthUrl();
  }

  async handleCallback(code: string): Promise<GoogleTokenData> {
    try {
      this.logger.log('Handling OAuth callback...');

      const { tokens } =
        await this.googleOAuthConfig.oauth2Client.getToken(code);

      const tokenData: GoogleTokenData = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        token_type: tokens.token_type,
        expiry_date: tokens.expiry_date,
      };

      // Save tokens to S3
      await this.repository.saveTokenToS3(tokenData);

      // Set credentials on the OAuth client
      this.googleOAuthConfig.oauth2Client.setCredentials(tokens);

      this.logger.log('Successfully authenticated and saved tokens');
      return tokenData;
    } catch (error: any) {
      this.logger.error(`Error handling OAuth callback: ${error.message}`);
      throw error;
    }
  }

  async getValidCredentials(): Promise<GoogleTokenData | null> {
    try {
      const tokenData = await this.repository.loadTokenFromS3();

      if (!tokenData) {
        this.logger.warn('No credentials found in S3');
        return null;
      }

      // Auto-refresh if needed
      const validTokenData = await this.repository.autoRefreshToken(tokenData);

      // Set credentials on the OAuth client
      this.googleOAuthConfig.oauth2Client.setCredentials({
        access_token: validTokenData.access_token,
        refresh_token: validTokenData.refresh_token,
        expiry_date: validTokenData.expiry_date,
        scope: validTokenData.scope,
        token_type: validTokenData.token_type,
      });

      return validTokenData;
    } catch (error: any) {
      this.logger.error(`Error getting valid credentials: ${error.message}`);
      throw error;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const tokenData = await this.repository.loadTokenFromS3();
      return tokenData !== null && !!tokenData.refresh_token;
    } catch (error) {
      return false;
    }
  }
}
