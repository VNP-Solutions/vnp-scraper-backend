import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Onboarding } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { CreateOnboardingDto } from './onboarding.dto';
import { IOnboardingRepository, IOnboardingService } from './onboarding.interface';

@Injectable()
export class OnboardingService implements IOnboardingService {
  private transporter: nodemailer.Transporter;

  constructor(
    @Inject('IOnboardingRepository')
    private readonly repository: IOnboardingRepository,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {
    const smtpHost = this.configService.get('SMTP_HOST') || 'smtp.gmail.com';
    const smtpPort = parseInt(this.configService.get('SMTP_PORT') || '465', 10);
    const smtpSecure = this.configService.get('SMTP_SECURE') !== 'false';
    const smtpUser = this.configService.get('SMTP_EMAIL');
    const smtpPass = this.configService.get('SMTP_PASSWORD');

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      ...(smtpHost === 'smtp.gmail.com' && { service: 'gmail' }),
      ...(smtpUser &&
        smtpPass && {
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        }),
      tls: {
        rejectUnauthorized: smtpSecure,
      },
    });
  }

  private parseOnboardingRecipients(): string[] {
    const raw = this.configService.get<string>('ONBOARDING_EMAIL') ?? '';
    return raw
      .split(/[,;]/)
      .map((addr) => addr.trim())
      .filter(Boolean);
  }

  private async sendOnboardingNotification(
    record: Onboarding,
    recipients: string[],
  ): Promise<void> {
    if (recipients.length === 0) {
      this.logger.warn(
        'ONBOARDING_EMAIL is empty; onboarding saved but no notification was sent.',
      );
      return;
    }

    const html = `
      <h2>New onboarding submission</h2>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Name</td><td>${this.escapeHtml(record.name)}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Company</td><td>${this.escapeHtml(record.company)}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Email</td><td>${this.escapeHtml(record.email)}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Phone</td><td>${this.escapeHtml(record.phone)}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Number of hotels</td><td>${record.number_of_hotels}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Submitted</td><td>${record.createdAt.toISOString()}</td></tr>
      </table>
    `;

    const text = [
      'New onboarding submission',
      `Name: ${record.name}`,
      `Company: ${record.company}`,
      `Email: ${record.email}`,
      `Phone: ${record.phone}`,
      `Number of hotels: ${record.number_of_hotels}`,
      `Submitted: ${record.createdAt.toISOString()}`,
    ].join('\n');

    await this.transporter.sendMail({
      from: 'VNP Team <team@vnp.app>',
      to: recipients,
      subject: `New onboarding: ${record.company}`,
      text,
      html,
    });
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async create(data: CreateOnboardingDto): Promise<Onboarding> {
    const record = await this.repository.create(data);
    const recipients = this.parseOnboardingRecipients();
    try {
      await this.sendOnboardingNotification(record, recipients);
    } catch (error) {
      this.logger.error(
        `Onboarding saved (${record.id}) but notification email failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
    return record;
  }
}
