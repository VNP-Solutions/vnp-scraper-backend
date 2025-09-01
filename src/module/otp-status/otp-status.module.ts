import { Logger, Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { OtpStatusController } from './otp-status.controller';
import { OtpStatusRepository } from './otp-status.repository';
import { OtpStatusService } from './otp-status.service';

@Module({
  imports: [],
  controllers: [OtpStatusController],
  providers: [
    {
      provide: 'IOtpStatusService',
      useClass: OtpStatusService,
    },
    {
      provide: 'IOtpStatusRepository',
      useClass: OtpStatusRepository,
    },
    DatabaseService,
    Logger,
  ],
  exports: ['IOtpStatusService', 'IOtpStatusRepository'],
})
export class OtpStatusModule {}
