import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    try {
      // Call parent canActivate to validate JWT
      const result = await super.canActivate(context);
      if (!result) {
        throw new UnauthorizedException('Invalid token');
      }

      // Get the request object
      const request = context.switchToHttp().getRequest();
      
      // Get the user from Passport validation
      const user = request.user;
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Set user in request object (already done by Passport, but ensuring it's there)
      request.user = user;

      return true;
    } catch (error) {
      throw new UnauthorizedException();
    }
  }
}