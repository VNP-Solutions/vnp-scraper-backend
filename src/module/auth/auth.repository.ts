import { Injectable, Logger } from '@nestjs/common';
import { OtpPurpose, RoleEnum, User } from '@prisma/client';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  async findUserByEmail(email: string): Promise<User | null> {
    try {
      return await this.db.user.findUnique({ where: { email } });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async createOTP(
    userId: string,
    otpCode: string,
    purpose: OtpPurpose = OtpPurpose.LOGIN,
    ipAddress?: string,
  ): Promise<void> {
    try {
      await this.db.otp.create({
        data: {
          user_id: userId,
          otp_code: otpCode,
          purpose: purpose,
          ip_address: ipAddress,
          expires_at: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes expiry
          is_used: false,
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findLatestOTP(userId: string, otpCode: string): Promise<any> {
    try {
      return await this.db.otp.findFirst({
        where: {
          user_id: userId,
          otp_code: otpCode,
          is_used: false,
          expires_at: {
            gt: new Date(),
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async deleteOTP(otpId: string): Promise<void> {
    try {
      await this.db.otp.delete({
        where: { id: otpId },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async createUser(
    name: string,
    email: string,
    role: RoleEnum,
    hashedPassword: string,
  ): Promise<User> {
    try {
      return await this.db.user.create({
        data: {
          name,
          email,
          role,
          password: hashedPassword,
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async updateUserPassword(
    userId: string,
    hashedPassword: string,
  ): Promise<User> {
    try {
      return await this.db.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async markOTPAsUsed(otpId: string): Promise<void> {
    try {
      await this.db.otp.update({
        where: { id: otpId },
        data: { is_used: true },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async updateLastLogin(userId: string): Promise<User> {
    try {
      return await this.db.user.update({
        where: { id: userId },
        data: { last_login: new Date() },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
}
