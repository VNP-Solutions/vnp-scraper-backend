import { Inject, Injectable } from '@nestjs/common';
import { IOtpLogRepository, IOtpLogService } from './otp-log.interface';

@Injectable()
export class OtpLogService implements IOtpLogService {
  constructor(
    @Inject('IOtpLogRepository')
    private readonly otpLogRepository: IOtpLogRepository,
  ) {}

  async getAllOtps(page = 1, limit = 10, query?: Record<string, any>) {
    const queryParams = {
      page,
      limit,
      ...query,
    };
    return this.otpLogRepository.findAll(queryParams);
  }

  async deleteOtp(id: string) {
    return this.otpLogRepository.delete(id);
  }
}
