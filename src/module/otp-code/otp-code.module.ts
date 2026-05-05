import { Logger, Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { OtpCodeController } from './otp-code.controller';
import { OtpCodeRepository } from './otp-code.repository';
import { OtpCodeService } from './otp-code.service';

@Module({
  imports: [],
  controllers: [OtpCodeController],
  providers: [
    {
      provide: 'IOtpCodeService',
      useClass: OtpCodeService,
    },
    {
      provide: 'IOtpCodeRepository',
      useClass: OtpCodeRepository,
    },
    DatabaseService,
    Logger,
  ],
  exports: ['IOtpCodeService', 'IOtpCodeRepository'],
})
export class OtpCodeModule {}
