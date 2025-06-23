import { Otp } from '@prisma/client';

export interface IOtpLogRepository {
  findAll(query?: Record<string, any>): Promise<{ data: Otp[]; metadata: any }>;

  delete(id: string): Promise<Otp>;
}

export interface IOtpLogService {
  getAllOtps(
    page?: number,
    limit?: number,
    query?: Record<string, any>,
  ): Promise<{ data: Otp[]; metadata: any }>;
  deleteOtp(id: string): Promise<Otp>;
}
