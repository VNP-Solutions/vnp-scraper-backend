import { Injectable, Logger } from '@nestjs/common';
import { Otp } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { IOtpLogRepository } from './otp-log.interface';

@Injectable()
export class OtpLogRepository implements IOtpLogRepository {
  private readonly logger = new Logger(OtpLogRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async findAll(
    query?: Record<string, any>,
  ): Promise<{ data: Otp[]; metadata: any }> {
    try {
      const {
        page,
        limit,
        sortBy,
        sortOrder,
        search,
        start_date,
        end_date,
        is_used,
        user_id,
        purpose,
        ip_address,
        ...filters
      } = query || {};
      const skip = page
        ? (parseInt(page || '1') - 1) * parseInt(limit || '10')
        : 0;
      const take = limit ? parseInt(limit) : 10;

      let orderBy = undefined;
      if (sortBy) {
        orderBy = {
          [sortBy]: sortOrder?.toLowerCase() === 'desc' ? 'desc' : 'asc',
        };
      } else {
        orderBy = {
          created_at: 'desc',
        };
      }

      let allFilters = { ...filters };

      // Build additional conditions array
      const additionalConditions = [];

      if (search) {
        additionalConditions.push({
          OR: [
            {
              otp_code: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              user: {
                name: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
            {
              user: {
                email: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
            {
              ip_address: {
                contains: search,
                mode: 'insensitive',
              },
            },
          ],
        });
      }

      if (start_date && end_date) {
        additionalConditions.push({
          created_at: {
            gte: new Date(start_date),
            lte: new Date(end_date),
          },
        });
      }

      if (is_used !== undefined) {
        additionalConditions.push({
          is_used: is_used,
        });
      }

      if (user_id) {
        additionalConditions.push({
          user_id: user_id,
        });
      }

      if (purpose) {
        additionalConditions.push({
          purpose: purpose,
        });
      }

      if (ip_address) {
        additionalConditions.push({
          ip_address: {
            contains: ip_address,
            mode: 'insensitive',
          },
        });
      }

      // Combine base filters with additional conditions
      if (additionalConditions.length > 0) {
        allFilters = {
          ...allFilters,
          AND: additionalConditions,
        };
      }

      const [otps, totalDocuments] = await Promise.all([
        this.db.otp.findMany({
          skip,
          take,
          orderBy,
          where: allFilters,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        }),
        this.db.otp.count({
          where: allFilters,
        }),
      ]);

      const metadata = {
        totalDocuments,
        currentPage: page ? parseInt(page) : 1,
        limit: take,
        totalPage: Math.ceil(totalDocuments / take),
      };

      return { data: otps, metadata };
    } catch (error) {
      this.logger.error('Error fetching OTPs:', error);
      return { data: [], metadata: null };
    }
  }

  async delete(id: string): Promise<Otp> {
    try {
      return await this.db.otp.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error('Error deleting OTP:', error);
      throw error;
    }
  }
}
