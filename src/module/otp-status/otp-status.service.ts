import { Inject, Injectable, Logger } from '@nestjs/common';
import { OtpStatus } from '@prisma/client';
import { CreateOtpStatusDto, UpdateOtpStatusDto } from './otp-status.dto';
import {
  IOtpStatusRepository,
  IOtpStatusService,
} from './otp-status.interface';

@Injectable()
export class OtpStatusService implements IOtpStatusService {
  constructor(
    @Inject('IOtpStatusRepository')
    private readonly repository: IOtpStatusRepository,
    private readonly logger: Logger,
  ) {}

  async createOtpStatus(data: CreateOtpStatusDto): Promise<OtpStatus> {
    try {
      const otpStatus = await this.repository.create(data);
      return otpStatus;
    } catch (error) {
      this.logger.error(
        `Error creating OTP status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getOtpStatus(): Promise<OtpStatus> {
    try {
      const otpStatus = await this.repository.find();
      if (!otpStatus) {
        return null;
      }
      return otpStatus;
    } catch (error) {
      this.logger.error(
        `Error finding OTP status: ${error.message}`,
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
      const otpStatus = await this.repository.update(id, data);
      return otpStatus;
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
