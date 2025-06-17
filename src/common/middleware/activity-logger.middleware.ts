import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { ActivityLogService } from '../../module/activity-log/activity-log.service';

@Injectable()
export class ActivityLoggerMiddleware implements NestMiddleware {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private extractResourceType(path: string): string {
    const pathSegments = path.split('/').filter(Boolean);
    if (pathSegments.length === 0) return 'unknown';

    // Map common resource types
    const resourceMap: { [key: string]: string } = {
      portfolios: 'Portfolio',
      'sub-portfolios': 'Sub Portfolio',
      properties: 'Property',
    };

    // Check first segment of path
    const firstSegment = pathSegments[0].toLowerCase();
    return resourceMap[firstSegment] || 'System';
  }

  use(req: Request, res: Response, next: NextFunction) {
    const originalSend = res.send;
    const startTime = Date.now();
    const middleware = this;

    res.send = function (body: any) {
      const responseTime = Date.now() - startTime;
      const success = res.statusCode >= 200 && res.statusCode < 300;

      // Get user info from request (assuming you're using JWT or similar auth)
      const user = (req as any).user || {
        username: 'anonymous',
        role: 'guest',
      };

      // Create an async IIFE to handle the async operations
      (async () => {
        try {
          const userId = (req as any).user?.userId;
          if (userId) {
            const dbUser =
              await middleware.activityLogService.getUserDetails(userId);
            if (dbUser) {
              user.username = dbUser.name;
              user.role = dbUser.role;
            }
          }

          // Extract resource type from URL
          const resource = middleware.extractResourceType(req.path);

          // Log to console
          console.log(
            `[${user.username}] [${user.role}] ${req.method} ${req.path} - ${success ? 'SUCCESS' : 'FAILED'} (${res.statusCode}) - IP: ${req.ip} - Resource: ${resource} - ${responseTime}ms - ${new Date().toISOString()}`,
          );

          if (req.path.startsWith('/activity-logs') && req.method === 'GET') {
            return next();
          }

          // Save to database
          await middleware.activityLogService.logActivity({
            username: user.username,
            role: user.role,
            endpoint: req.method + ' ' + req.path,
            success: success,
            statusCode: res.statusCode,
            ipAddress: req.ip,
            resource: resource,
            responseTime: responseTime,
          });
        } catch (error) {
          console.error('Error in activity logging:', error);
        }
      })();

      return originalSend.call(this, body);
    };

    next();
  }
}
