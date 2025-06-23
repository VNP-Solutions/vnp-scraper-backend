import { Module } from '@nestjs/common';
import { OtpLogController } from './otp-log.controller';
import { OtpLogRepository } from './otp-log.repository';
import { OtpLogService } from './otp-log.service';

@Module({
  controllers: [OtpLogController],
  providers: [
    OtpLogService,
    {
      provide: 'IOtpLogRepository',
      useClass: OtpLogRepository,
    },
    {
      provide: 'IOtpLogService',
      useClass: OtpLogService,
    },
  ],
  exports: [OtpLogService],
})
export class OtpLogModule {}
