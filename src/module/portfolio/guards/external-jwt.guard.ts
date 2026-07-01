import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

/**
 * Validates Bearer JWT signed with JWT_COMMUNICATION_SECRET for portfolio sync endpoints.
 */
@Injectable()
export class ExternalJwtGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Record<string, any>>();
    const authHeader = request.headers?.authorization as string | undefined;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid authorization header',
      );
    }

    const token = authHeader.substring(7).trim();
    const secret =
      this.configService.get<string>('JWT_COMMUNICATION_SECRET') ??
      this.configService.get<string>('DASHBOARD_PROXY_SECRET');

    if (!secret) {
      throw new UnauthorizedException(
        'Communication secret is not configured on this server',
      );
    }

    try {
      const payload = this.jwtService.verify(token, { secret });
      request.externalAuthPayload = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired communication token');
    }
  }
}
