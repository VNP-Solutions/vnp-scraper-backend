import { Logger, Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { JobOtpController } from './job-otp.controller';
import { JobOtpRepository } from './job-otp.repository';
import { JobOtpService } from './job-otp.service';

@Module({
  controllers: [JobOtpController],
  providers: [
    {
      provide: 'IJobOtpService',
      useClass: JobOtpService,
    },
    {
      provide: 'IJobOtpRepository',
      useClass: JobOtpRepository,
    },
    DatabaseService,
    Logger,
  ],
  exports: ['IJobOtpService', 'IJobOtpRepository'],
})
export class JobOtpModule {}
