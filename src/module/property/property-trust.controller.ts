import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Inject,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { ResponseHandler } from 'src/common/utils/response.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookingJobRouterService } from '../job/booking-job-router.service';
import { DatabaseService } from '../database/database.service';
import axios from 'axios';

@ApiTags('Property Trust')
@ApiBearerAuth('JWT-auth')
@Controller('/properties/trust')
export class PropertyTrustController {
  private readonly MODULAR_SCRAPER_URL = process.env.MODULAR_SCRAPER_URL || 'http://localhost:3000';
  
  constructor(
    private readonly bookingJobRouter: BookingJobRouterService,
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  @Get('/status/:propertyId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get trust status for a property' })
  @ApiParam({ name: 'propertyId', description: 'Property ID' })
  @ApiResponse({ status: 200, description: 'Trust status retrieved successfully' })
  async getPropertyTrustStatus(
    @Param('propertyId') propertyId: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const property = await this.db.property.findUnique({
          where: { id: propertyId },
        });

        if (!property) {
          return {
            statusCode: 404,
            message: 'Property not found',
          };
        }

        const trustStatus = await this.bookingJobRouter.getPropertyTrustStatus(propertyId);
        
        return {
          statusCode: 200,
          message: 'Trust status retrieved successfully',
          data: {
            propertyId,
            propertyName: property.name,
            bookingId: property.booking_id,
            trustStatus: property.booking_trusted_status || 'not_trusted',
            trustScore: property.booking_trust_score || 0,
            successfulLogins: property.booking_successful_logins || 0,
            failedLogins: property.booking_failed_logins || 0,
            lastLogin: property.booking_last_login,
            trustEstablishedDate: property.booking_trust_established_date,
            needsVerification: trustStatus.needsVerification,
            hoursSinceLastLogin: trustStatus.hoursSinceLastLogin,
            maintenanceSchedule: this.getMaintenanceSchedule(property.booking_trust_score || 0),
          },
        };
      },
      this.logger,
    );
  }

  @Get('/untrusted')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all untrusted booking properties' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Untrusted properties retrieved successfully' })
  async getUntrustedProperties(
    @Query('limit') limit?: string,
    @Res() response?: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const properties = await this.db.property.findMany({
          where: {
            booking_id: { not: null },
            booking_trusted_status: 'not_trusted',
          },
          take: limit ? parseInt(limit) : 50,
          orderBy: {
            booking_last_login: 'asc', // Oldest first
          },
        });

        const propertiesWithStatus = await Promise.all(
          properties.map(async (property) => {
            const trustStatus = await this.bookingJobRouter.getPropertyTrustStatus(property.id);
            return {
              id: property.id,
              name: property.name,
              bookingId: property.booking_id,
              trustScore: property.booking_trust_score || 0,
              lastLogin: property.booking_last_login,
              needsVerification: trustStatus.needsVerification,
              hoursSinceLastLogin: trustStatus.hoursSinceLastLogin,
            };
          }),
        );

        return {
          statusCode: 200,
          message: 'Untrusted properties retrieved successfully',
          data: {
            total: propertiesWithStatus.length,
            needingVerification: propertiesWithStatus.filter(p => p.needsVerification).length,
            properties: propertiesWithStatus,
          },
        };
      },
      this.logger,
    );
  }

  @Get('/trusted')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all trusted booking properties' })
  @ApiQuery({ name: 'minScore', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Trusted properties retrieved successfully' })
  async getTrustedProperties(
    @Query('minScore') minScore?: string,
    @Res() response?: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const minTrustScore = minScore ? parseInt(minScore) : 70;
        
        const properties = await this.db.property.findMany({
          where: {
            booking_id: { not: null },
            booking_trusted_status: 'trusted',
            booking_trust_score: { gte: minTrustScore },
          },
          orderBy: {
            booking_trust_score: 'desc',
          },
        });

        const propertiesWithStatus = properties.map(property => ({
          id: property.id,
          name: property.name,
          bookingId: property.booking_id,
          trustScore: property.booking_trust_score || 0,
          successfulLogins: property.booking_successful_logins || 0,
          lastLogin: property.booking_last_login,
          trustEstablishedDate: property.booking_trust_established_date,
          maintenanceSchedule: this.getMaintenanceSchedule(property.booking_trust_score || 0),
          daysSinceLastLogin: property.booking_last_login
            ? (Date.now() - new Date(property.booking_last_login).getTime()) / (1000 * 60 * 60 * 24)
            : null,
        }));

        return {
          statusCode: 200,
          message: 'Trusted properties retrieved successfully',
          data: {
            total: propertiesWithStatus.length,
            minScore: minTrustScore,
            properties: propertiesWithStatus,
          },
        };
      },
      this.logger,
    );
  }

  @Post('/verify/:propertyId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Trigger trust verification for a property' })
  @ApiParam({ name: 'propertyId', description: 'Property ID' })
  @ApiResponse({ status: 200, description: 'Trust verification triggered successfully' })
  async triggerTrustVerification(
    @Param('propertyId') propertyId: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const property = await this.db.property.findUnique({
          where: { id: propertyId },
        });

        if (!property) {
          return {
            statusCode: 404,
            message: 'Property not found',
          };
        }

        if (!property.booking_id || property.booking_id <= 0) {
          return {
            statusCode: 400,
            message: 'Property has no valid booking_id',
          };
        }

        // Execute trust verification
        const isTrusted = await this.bookingJobRouter.executeTrustVerification(propertyId);
        
        // Get updated property
        const updatedProperty = await this.db.property.findUnique({
          where: { id: propertyId },
        });

        return {
          statusCode: 200,
          message: isTrusted 
            ? 'Trust verification successful - property is trusted' 
            : 'Trust verification completed - property is not trusted',
          data: {
            propertyId,
            propertyName: property.name,
            bookingId: property.booking_id,
            previousStatus: property.booking_trusted_status,
            newStatus: updatedProperty.booking_trusted_status,
            trustScore: updatedProperty.booking_trust_score,
            isTrusted,
          },
        };
      },
      this.logger,
    );
  }

  @Get('/statistics')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get trust statistics for all booking properties' })
  @ApiResponse({ status: 200, description: 'Trust statistics retrieved successfully' })
  async getTrustStatistics(@Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const [
          totalProperties,
          trustedProperties,
          untrustedProperties,
          highTrustProperties,
          mediumTrustProperties,
          lowTrustProperties,
          neverLoggedIn,
          needingVerification,
        ] = await Promise.all([
          // Total properties with booking_id
          this.db.property.count({
            where: { booking_id: { not: null } },
          }),
          // Trusted properties
          this.db.property.count({
            where: { 
              booking_id: { not: null },
              booking_trusted_status: 'trusted',
            },
          }),
          // Untrusted properties
          this.db.property.count({
            where: { 
              booking_id: { not: null },
              booking_trusted_status: 'not_trusted',
            },
          }),
          // High trust (>= 80)
          this.db.property.count({
            where: { 
              booking_id: { not: null },
              booking_trust_score: { gte: 80 },
            },
          }),
          // Medium trust (50-79)
          this.db.property.count({
            where: { 
              booking_id: { not: null },
              booking_trust_score: { gte: 50, lt: 80 },
            },
          }),
          // Low trust (< 50)
          this.db.property.count({
            where: { 
              booking_id: { not: null },
              booking_trust_score: { lt: 50 },
            },
          }),
          // Never logged in
          this.db.property.count({
            where: { 
              booking_id: { not: null },
              booking_last_login: null,
            },
          }),
          // Needing verification (approximation)
          this.db.property.count({
            where: { 
              booking_id: { not: null },
              OR: [
                {
                  booking_trusted_status: 'not_trusted',
                  booking_last_login: {
                    lt: new Date(Date.now() - 23 * 60 * 60 * 1000), // 23 hours ago
                  },
                },
                {
                  booking_trusted_status: 'not_trusted',
                  booking_last_login: null,
                },
                {
                  booking_trusted_status: 'trusted',
                  booking_last_login: {
                    lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
                  },
                },
              ],
            },
          }),
        ]);

        // Get average trust score
        const avgScoreResult = await this.db.property.aggregate({
          where: { 
            booking_id: { not: null },
            booking_trust_score: { not: null },
          },
          _avg: {
            booking_trust_score: true,
          },
        });

        return {
          statusCode: 200,
          message: 'Trust statistics retrieved successfully',
          data: {
            totalProperties,
            trustedProperties,
            untrustedProperties,
            trustLevels: {
              high: highTrustProperties,
              medium: mediumTrustProperties,
              low: lowTrustProperties,
            },
            averageTrustScore: avgScoreResult._avg.booking_trust_score || 0,
            neverLoggedIn,
            needingVerification,
            percentages: {
              trusted: totalProperties > 0 ? (trustedProperties / totalProperties * 100).toFixed(1) : 0,
              untrusted: totalProperties > 0 ? (untrustedProperties / totalProperties * 100).toFixed(1) : 0,
              needingVerification: totalProperties > 0 ? (needingVerification / totalProperties * 100).toFixed(1) : 0,
            },
          },
        };
      },
      this.logger,
    );
  }

  /**
   * Get maintenance schedule based on trust score
   */
  private getMaintenanceSchedule(trustScore: number): string {
    if (trustScore >= 80) {
      return 'Weekly (7 days)';
    } else if (trustScore >= 50) {
      return 'Every 2 days';
    } else {
      return 'Every 12 hours';
    }
  }
}