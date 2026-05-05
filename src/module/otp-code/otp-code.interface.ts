import { OtpCode } from '@prisma/client';
import { CreateOtpCodeDto } from './otp-code.dto';

export interface IOtpCodeRepository {
  create(data: CreateOtpCodeDto): Promise<OtpCode>;
}

export interface IOtpCodeService {
  createOtpCode(data: CreateOtpCodeDto): Promise<OtpCode>;
}
