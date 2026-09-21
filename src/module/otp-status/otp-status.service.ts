import { Inject, Injectable, Logger } from '@nestjs/common';
import { OtpPlatform, OtpStatus } from '@prisma/client';
import { CreateOtpStatusDto, UpdateOtpStatusDto } from './otp-status.dto';
import {
  IOtpStatusRepository,
  IOtpStatusService,
} from './otp-status.interface';

/** API name for Trip.com. Prisma stores the enum value `trip_com`. */
const TRIP_PLATFORM_API = 'trip.com';

function toStoredPlatform(platform?: string | null): OtpPlatform | undefined {
  if (platform == null || platform === '') return undefined;
  if (platform === TRIP_PLATFORM_API || platform === OtpPlatform.trip_com) {
    return OtpPlatform.trip_com;
  }
  return platform as OtpPlatform;
}

function presentOtpStatus<T extends { platform?: string | null }>(
  row: T | null,
): T | null {
  if (!row || row.platform !== OtpPlatform.trip_com) return row;
  return { ...row, platform: TRIP_PLATFORM_API };
}

@Injectable()
export class OtpStatusService implements IOtpStatusService {
  constructor(
    @Inject('IOtpStatusRepository')
    private readonly repository: IOtpStatusRepository,
    private readonly logger: Logger,
  ) {}

  async createOtpStatus(data: CreateOtpStatusDto): Promise<OtpStatus> {
    try {
      const otpStatus = await this.repository.create({
        ...data,
        platform: toStoredPlatform(data.platform),
      });
      return presentOtpStatus(otpStatus);
    } catch (error) {
      this.logger.error(
        `Error creating OTP status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getOtpStatus(): Promise<any> {
    try {
      const otpStatus = await this.repository.find();
      if (!otpStatus) {
        return null;
      }
      const platforms = [
        'expedia',
        'agoda',
        'booking',
        'expedia_retrieval',
        'agoda_retrieval',
        'trip.com',
      ];
      const result = {
        expedia: null,
        agoda: null,
        booking: null,
        expedia_retrieval: null,
        agoda_retrieval: null,
        'trip.com': null,
      };

      if (Array.isArray(otpStatus)) {
        for (const platform of platforms) {
          const stored =
            platform === TRIP_PLATFORM_API ? OtpPlatform.trip_com : platform;
          const found = otpStatus.find((item) => item.platform === stored);
          result[platform] = found ? presentOtpStatus(found) : null;
        }
      }
      return result;
    } catch (error) {
      this.logger.error(
        `Error finding OTP status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getOtpStatusByPlatform(platform: OtpPlatform): Promise<OtpStatus | null> {
    try {
      const otpStatus = await this.repository.findByPlatform(
        toStoredPlatform(platform) as OtpPlatform,
      );
      return presentOtpStatus(otpStatus);
    } catch (error) {
      this.logger.error(
        `Error finding OTP status by platform: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateOtpStatus(
    id: string,
    data: UpdateOtpStatusDto,
  ): Promise<OtpStatus> {
    try {
      const otpStatus = await this.repository.update(id, {
        ...data,
        platform: toStoredPlatform(data.platform),
      });
      return presentOtpStatus(otpStatus);
    } catch (error) {
      this.logger.error(
        `Error updating OTP status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async deleteOtpStatus(id: string): Promise<any> {
    try {
      await this.repository.delete(id);
    } catch (error) {
      this.logger.error(
        `Error deleting OTP status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
