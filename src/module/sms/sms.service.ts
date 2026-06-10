import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  isOutboundSmsConfigured,
  sendOutboundSms,
  type OutboundSmsResult,
} from 'src/common/audit-ready-sms';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  isConfigured(): boolean {
    return isOutboundSmsConfigured();
  }

  async sendSms(to: string, body: string): Promise<OutboundSmsResult> {
    if (!isOutboundSmsConfigured()) {
      throw new BadRequestException(
        'SMS is not configured. Set Ejoin (EJOIN_SMS_GATEWAY_URL, EJOIN_SMS_USERNAME, EJOIN_SMS_PASSWORD) or Twilio credentials.',
      );
    }

    try {
      return await sendOutboundSms(to, body);
    } catch (error: any) {
      const message = error?.message || 'Unknown error';
      this.logger.error(`Outbound SMS failed: ${message}`, error?.stack);
      throw new BadRequestException(`Failed to send SMS: ${message}`);
    }
  }
}
