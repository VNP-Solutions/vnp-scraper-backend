import { OtpPlatform, OtpStatus } from '@prisma/client';
import { CreateOtpStatusDto, UpdateOtpStatusDto } from './otp-status.dto';

export interface IOtpStatusRepository {
  create(data: CreateOtpStatusDto): Promise<OtpStatus>;
  find(): Promise<OtpStatus[]>;
  findByPlatform(platform: OtpPlatform): Promise<OtpStatus | null>;
  update(id: string, data: UpdateOtpStatusDto): Promise<OtpStatus>;
  delete(id: string): Promise<OtpStatus>;
}

export interface IOtpStatusService {
  createOtpStatus(data: CreateOtpStatusDto): Promise<OtpStatus>;
  getOtpStatus(): Promise<any>;
  getOtpStatusByPlatform(platform: OtpPlatform): Promise<OtpStatus | null>;
  updateOtpStatus(id: string, data: UpdateOtpStatusDto): Promise<OtpStatus>;
  deleteOtpStatus(id: string): Promise<OtpStatus>;
}
