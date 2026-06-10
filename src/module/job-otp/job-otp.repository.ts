import { Injectable, Logger } from '@nestjs/common';
import { JobCurrentOtp, Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { CreateJobOtpDto, UpdateJobOtpDto } from './job-otp.dto';
import { IJobOtpRepository } from './job-otp.interface';

@Injectable()
export class JobOtpRepository implements IJobOtpRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger,
  ) {}

  async create(data: CreateJobOtpDto): Promise<JobCurrentOtp> {
    try {
      return await this.db.jobCurrentOtp.create({
        data: {
          otp: data.otp,
          ota: data.ota,
          job: { connect: { id: data.job_id } },
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findById(id: string): Promise<JobCurrentOtp | null> {
    try {
      return await this.db.jobCurrentOtp.findUnique({ where: { id } });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findByJobId(jobId: string): Promise<JobCurrentOtp | null> {
    try {
      return await this.db.jobCurrentOtp.findFirst({
        where: { job_id: jobId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async update(id: string, data: UpdateJobOtpDto): Promise<JobCurrentOtp> {
    try {
      const updateData: Prisma.JobCurrentOtpUpdateInput = {};

      if (data.otp !== undefined) {
        updateData.otp = data.otp;
      }
      if (data.ota !== undefined) {
        updateData.ota = data.ota;
      }
      if (data.job_id !== undefined) {
        updateData.job = { connect: { id: data.job_id } };
      }

      return await this.db.jobCurrentOtp.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
}
