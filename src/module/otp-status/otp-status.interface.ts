import { OtpStatus } from '@prisma/client';
import { CreateOtpStatusDto, UpdateOtpStatusDto } from './otp-status.dto';

export interface IOtpStatusRepository {
  create(data: CreateOtpStatusDto): Promise<OtpStatus>;
  find(): Promise<OtpStatus>;
  update(id: string, data: UpdateOtpStatusDto): Promise<OtpStatus>;
  delete(id: string): Promise<OtpStatus>;
}

export interface IOtpStatusService {
  createOtpStatus(data: CreateOtpStatusDto): Promise<OtpStatus>;
  getOtpStatus(): Promise<OtpStatus>;
  updateOtpStatus(id: string, data: UpdateOtpStatusDto): Promise<OtpStatus>;
  deleteOtpStatus(id: string): Promise<OtpStatus>;
}
