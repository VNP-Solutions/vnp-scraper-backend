import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  private prisma: PrismaClient;

  constructor() {
    super();
    this.prisma = new PrismaClient();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Check database connection
      await this.prisma.$connect();
      
      // Verify schema by checking if we can query properties
      const propertyCount = await this.prisma.property.count();
      
      // Check if trust fields exist by trying to query them
      const trustFieldsExist = await this.checkTrustFields();
      
      await this.prisma.$disconnect();
      
      return this.getStatus(key, true, {
        connected: true,
        propertyCount,
        trustFieldsExist,
        message: 'Database is healthy and schema is up to date',
      });
    } catch (error) {
      await this.prisma.$disconnect();
      throw new HealthCheckError(
        'Database health check failed',
        this.getStatus(key, false, {
          connected: false,
          error: error.message,
          message: 'Database is unhealthy or schema is outdated',
        }),
      );
    }
  }

  private async checkTrustFields(): Promise<boolean> {
    try {
      // Try to query a property with trust fields
      const result = await this.prisma.property.findFirst({
        select: {
          booking_trusted_status: true,
          booking_trust_score: true,
          booking_successful_logins: true,
          booking_failed_logins: true,
          booking_last_login: true,
          booking_trust_established_date: true,
        },
      });
      
      // If query succeeds, fields exist
      return true;
    } catch (error) {
      // If query fails, fields might not exist
      console.warn('Trust fields check failed:', error.message);
      return false;
    }
  }

  async checkMigrationStatus(): Promise<{
    isUpToDate: boolean;
    pendingMigrations: string[];
    appliedMigrations: string[];
  }> {
    try {
      // For MongoDB with db push, we can't track migrations like SQL
      // Instead, we verify the schema is correct
      const trustFieldsExist = await this.checkTrustFields();
      
      return {
        isUpToDate: trustFieldsExist,
        pendingMigrations: trustFieldsExist ? [] : ['trust_fields_migration'],
        appliedMigrations: trustFieldsExist ? ['trust_fields_migration'] : [],
      };
    } catch (error) {
      return {
        isUpToDate: false,
        pendingMigrations: ['unknown'],
        appliedMigrations: [],
      };
    }
  }
}