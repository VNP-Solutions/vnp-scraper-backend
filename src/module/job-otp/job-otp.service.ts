import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JobCurrentOtp } from '@prisma/client';
import { CreateJobOtpDto, UpdateJobOtpDto } from './job-otp.dto';
import { IJobOtpRepository, IJobOtpService } from './job-otp.interface';

@Injectable()
export class JobOtpService implements IJobOtpService {
  constructor(
    @Inject('IJobOtpRepository')
    private readonly repository: IJobOtpRepository,
    private readonly logger: Logger,
  ) {}

  async createJobOtp(data: CreateJobOtpDto): Promise<JobCurrentOtp> {
    try {
      return await this.repository.create(data);
    } catch (error) {
      this.logger.error(
        `Error creating job OTP: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getJobOtpById(id: string): Promise<JobCurrentOtp> {
    try {
      const record = await this.repository.findById(id);
      if (!record) {
        throw new NotFoundException(`Job OTP with ID ${id} not found`);
      }
      return record;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Error finding job OTP: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getJobOtpByJobId(jobId: string): Promise<JobCurrentOtp> {
    try {
      const record = await this.repository.findByJobId(jobId);
      if (!record) {
        throw new NotFoundException(
          `Job OTP for job ID ${jobId} not found`,
        );
      }
      return record;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Error finding job OTP by job ID: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateJobOtp(id: string, data: UpdateJobOtpDto): Promise<JobCurrentOtp> {
    try {
      await this.getJobOtpById(id);
      return await this.repository.update(id, data);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Error updating job OTP: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
