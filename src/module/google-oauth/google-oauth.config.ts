import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

@Injectable()
export class GoogleOAuthConfig {
  public readonly oauth2Client;
  private readonly scopes = ['https://www.googleapis.com/auth/gmail.readonly'];

  constructor(private readonly configService: ConfigService) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        'Missing Google OAuth configuration. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env file',
      );
    }

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );
  }

  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      prompt: 'consent',
    });
  }
}
