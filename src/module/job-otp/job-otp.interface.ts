import { JobCurrentOtp } from '@prisma/client';
import { CreateJobOtpDto, UpdateJobOtpDto } from './job-otp.dto';

export interface IJobOtpRepository {
  create(data: CreateJobOtpDto): Promise<JobCurrentOtp>;
  findById(id: string): Promise<JobCurrentOtp | null>;
  findByJobId(jobId: string): Promise<JobCurrentOtp | null>;
  update(id: string, data: UpdateJobOtpDto): Promise<JobCurrentOtp>;
}

export interface IJobOtpService {
  createJobOtp(data: CreateJobOtpDto): Promise<JobCurrentOtp>;
  getJobOtpById(id: string): Promise<JobCurrentOtp>;
  getJobOtpByJobId(jobId: string): Promise<JobCurrentOtp>;
  updateJobOtp(id: string, data: UpdateJobOtpDto): Promise<JobCurrentOtp>;
}
