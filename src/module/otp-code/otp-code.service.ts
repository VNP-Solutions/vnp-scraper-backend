import { Inject, Injectable, Logger } from '@nestjs/common';
import { OtpCode } from '@prisma/client';
import { CreateOtpCodeDto } from './otp-code.dto';
import {
  IOtpCodeRepository,
  IOtpCodeService,
} from './otp-code.interface';

@Injectable()
export class OtpCodeService implements IOtpCodeService {
  constructor(
    @Inject('IOtpCodeRepository')
    private readonly repository: IOtpCodeRepository,
    private readonly logger: Logger,
  ) {}

  async createOtpCode(data: CreateOtpCodeDto): Promise<OtpCode> {
    try {
      const otpCode = await this.repository.create(data);
      return otpCode;
    } catch (error) {
      this.logger.error(
        `Error creating OTP code: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
