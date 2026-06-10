import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmsService } from './sms.service';

@Module({
  imports: [ConfigModule],
  providers: [SmsService, Logger],
  exports: [SmsService],
})
export class SmsModule {}
