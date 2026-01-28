import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleOAuthConfig } from './google-oauth.config';
import {
  GoogleTokenData,
  IGoogleOAuthRepository,
} from './google-oauth.interface';

@Injectable()
export class GoogleOAuthRepository implements IGoogleOAuthRepository {
  private readonly logger = new Logger(GoogleOAuthRepository.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly tokenS3Key: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly googleOAuthConfig: GoogleOAuthConfig,
  ) {
    this.s3Client = new S3Client({
      region: this.configService.get<string>('S3_REGION'),
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY'),
        secretAccessKey: this.configService.get<string>('S3_SECRET_KEY'),
      },
    });
    this.bucket = this.configService.get<string>('S3_BUCKET_NAME');
    this.tokenS3Key =
      this.configService.get<string>('GOOGLE_TOKEN_S3_KEY') ||
      'keyspace/token.json';
  }

  async loadTokenFromS3(): Promise<GoogleTokenData | null> {
    try {
      this.logger.log(`Loading Google OAuth token from S3: ${this.tokenS3Key}`);

      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.tokenS3Key,
      });

      const response = await this.s3Client.send(command);
      const bodyContents = await response.Body.transformToString();
      const tokenData = JSON.parse(bodyContents) as GoogleTokenData;

      this.logger.log('Successfully loaded token from S3');
      return tokenData;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        this.logger.warn('No token found in S3');
        return null;
      }
      this.logger.error(`Error loading token from S3: ${error.message}`);
      throw error;
    }
  }

  async saveTokenToS3(tokenData: GoogleTokenData): Promise<void> {
    try {
      this.logger.log(`Saving Google OAuth token to S3: ${this.tokenS3Key}`);

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.tokenS3Key,
        Body: JSON.stringify(tokenData, null, 2),
        ContentType: 'application/json',
      });

      await this.s3Client.send(command);
      this.logger.log('Successfully saved token to S3');
    } catch (error: any) {
      this.logger.error(`Error saving token to S3: ${error.message}`);
      throw error;
    }
  }

  needsTokenRefresh(tokenData: GoogleTokenData): boolean {
    if (!tokenData.expiry_date) {
      return true;
    }

    const now = Date.now();
    const expiryTime = tokenData.expiry_date;
    const timeUntilExpiry = expiryTime - now;
    const fiveMinutes = 5 * 60 * 1000;

    const needsRefresh = timeUntilExpiry < fiveMinutes;

    if (needsRefresh) {
      this.logger.log(
        `Token expires in ${Math.floor(timeUntilExpiry / 1000)} seconds, refresh needed`,
      );
    }

    return needsRefresh;
  }

  async refreshToken(refreshToken: string): Promise<GoogleTokenData> {
    try {
      this.logger.log('Refreshing Google OAuth token...');

      this.googleOAuthConfig.oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } =
        await this.googleOAuthConfig.oauth2Client.refreshAccessToken();

      const tokenData: GoogleTokenData = {
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token || refreshToken,
        scope: credentials.scope,
        token_type: credentials.token_type,
        expiry_date: credentials.expiry_date,
      };

      this.logger.log('Successfully refreshed token');
      return tokenData;
    } catch (error: any) {
      this.logger.error(`Error refreshing token: ${error.message}`);
      throw error;
    }
  }

  async autoRefreshToken(tokenData: GoogleTokenData): Promise<GoogleTokenData> {
    if (!this.needsTokenRefresh(tokenData)) {
      this.logger.log('Token is still valid, no refresh needed');
      return tokenData;
    }

    if (!tokenData.refresh_token) {
      throw new Error(
        'No refresh token available. Re-authentication required.',
      );
    }

    const newTokenData = await this.refreshToken(tokenData.refresh_token);
    await this.saveTokenToS3(newTokenData);
    return newTokenData;
  }
}
