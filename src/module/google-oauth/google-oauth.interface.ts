export interface GoogleTokenData {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export interface IGoogleOAuthRepository {
  loadTokenFromS3(): Promise<GoogleTokenData | null>;
  saveTokenToS3(tokenData: GoogleTokenData): Promise<void>;
  needsTokenRefresh(tokenData: GoogleTokenData): boolean;
  refreshToken(refreshToken: string): Promise<GoogleTokenData>;
  autoRefreshToken(tokenData: GoogleTokenData): Promise<GoogleTokenData>;
}

export interface IGoogleOAuthService {
  getAuthUrl(): string;
  handleCallback(code: string): Promise<GoogleTokenData>;
  getValidCredentials(): Promise<GoogleTokenData | null>;
  isAuthenticated(): Promise<boolean>;
}
