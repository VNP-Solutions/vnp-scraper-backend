import { Injectable, Logger } from '@nestjs/common';
import { OtpPlatform, OtpStatus } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { CreateOtpStatusDto, UpdateOtpStatusDto } from './otp-status.dto';
import { IOtpStatusRepository } from './otp-status.interface';

@Injectable()
export class OtpStatusRepository implements IOtpStatusRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  get databaseService(): DatabaseService {
    return this.db;
  }

  async create(data: CreateOtpStatusDto): Promise<OtpStatus> {
    try {
      const otpStatus = await this.db.otpStatus.create({
        data,
      });
      return otpStatus;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async find(): Promise<OtpStatus[]> {
    try {
      const otpStatus = await this.db.otpStatus.findMany();
      return otpStatus;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findByPlatform(platform: OtpPlatform): Promise<OtpStatus | null> {
    try {
      const otpStatus = await this.db.otpStatus.findFirst({
        where: { platform },
        orderBy: { updatedAt: 'desc' },
      });
      return otpStatus;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async update(id: string, data: UpdateOtpStatusDto): Promise<OtpStatus> {
    try {
      const otpStatus = await this.db.otpStatus.update({
        where: { id },
        data,
        include: {
          job: {
            select: {
              id: true,
              name: true,
              property_name: true,
              job_status: true,
            },
          },
        },
      });
      return otpStatus;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async delete(id: string): Promise<OtpStatus> {
    try {
      const otpStatus = await this.db.otpStatus.delete({
        where: { id },
      });
      return otpStatus;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }
}
