import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private readonly cfg: ConfigService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.cfg.get<string>('SERVICE_TOKEN') ?? '';
    if (!expected) throw new UnauthorizedException('service auth not configured');
    const req = ctx.switchToHttp().getRequest<Request>();
    if (req.header('x-service-token') !== expected) throw new UnauthorizedException('invalid service token');
    return true;
  }
}