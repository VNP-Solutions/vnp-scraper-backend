import { Injectable, Logger } from '@nestjs/common';
import { OtpCode, Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { CreateOtpCodeDto } from './otp-code.dto';
import { IOtpCodeRepository } from './otp-code.interface';

@Injectable()
export class OtpCodeRepository implements IOtpCodeRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  get databaseService(): DatabaseService {
    return this.db;
  }

  async create(data: CreateOtpCodeDto): Promise<OtpCode> {
    try {
      // `used` is intentionally omitted; Prisma applies @default(false).
      const createInput: Prisma.OtpCodeCreateInput = {
        provider: data.provider,
        otp_code: data.otp_code,
        ...(data.job_id
          ? { job: { connect: { id: data.job_id } } }
          : {}),
      };

      const otpCode = await this.db.otpCode.create({
        data: createInput,
      });
      return otpCode;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }
}
