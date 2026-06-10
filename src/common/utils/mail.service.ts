import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { ReportsCurrentCounts } from '../../module/reports/reports.interface';

/**
 * Shared SMTP / Nodemailer wrapper.
 *
 * Currently used by the Reports async-export pipeline. Existing modules
 * that build their own `nodemailer.createTransport(...)` inline
 * (`auth.service.ts`, `user-invitation.service.ts`) are NOT migrated in
 * this PR — they can switch later without behaviour changes.
 *
 * Reads the same env vars the rest of the codebase already uses:
 *   SMTP_HOST     (default: smtp.gmail.com)
 *   SMTP_PORT     (default: 465)
 *   SMTP_SECURE   (default: true; set to "false" for STARTTLS)
 *   SMTP_EMAIL    (auth.user — required for outbound)
 *   SMTP_PASSWORD (auth.pass — required for outbound)
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    const smtpHost = this.configService.get('SMTP_HOST') || 'smtp.gmail.com';
    const smtpPort = parseInt(this.configService.get('SMTP_PORT') || '465');
    const smtpSecure = this.configService.get('SMTP_SECURE') !== 'false';
    const smtpUser = this.configService.get('SMTP_EMAIL');
    const smtpPass = this.configService.get('SMTP_PASSWORD');

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      ...(smtpHost === 'smtp.gmail.com' && { service: 'gmail' }),
      ...(smtpUser && smtpPass && {
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      }),
      tls: {
        rejectUnauthorized: smtpSecure,
      },
    });

    this.fromAddress = smtpUser || 'noreply@vnpsolutions.com';
  }

  /**
   * Send the "Your report is ready" email containing a presigned S3
   * download link. Called by the async-export consumer once the file
   * has been built and uploaded.
   */
  async sendReportReadyEmail(opts: {
    to: string;
    userName?: string | null;
    exportLabel: string; // e.g. "Master ZIP", "Consolidated Report", "Dashboard Report"
    jobCount: number;
    downloadUrl: string;
    downloadFileName: string;
    expiresAt: Date;
  }): Promise<void> {
    const safeName = (opts.userName || 'there').trim();
    const expiresFmt = opts.expiresAt.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const subject = `Your VNP Reports export is ready (${opts.exportLabel})`;
    const html = this.buildReadyHtml({
      safeName,
      exportLabel: opts.exportLabel,
      jobCount: opts.jobCount,
      downloadUrl: opts.downloadUrl,
      downloadFileName: opts.downloadFileName,
      expiresFmt,
    });
    const text = this.buildReadyText({
      safeName,
      exportLabel: opts.exportLabel,
      jobCount: opts.jobCount,
      downloadUrl: opts.downloadUrl,
      downloadFileName: opts.downloadFileName,
      expiresFmt,
    });

    await this.transporter.sendMail({
      from: this.fromAddress,
      to: opts.to,
      subject,
      html,
      text,
    });
    this.logger.log(
      `Sent "report ready" email to ${opts.to} (${opts.exportLabel}, ${opts.jobCount} jobs)`,
    );
  }

  /**
   * Send the "Your report failed" email so the user isn't left hanging
   * when the SQS consumer can't build / upload / link the export.
   */
  async sendReportFailedEmail(opts: {
    to: string;
    userName?: string | null;
    exportLabel: string;
    jobCount: number;
    reason: string;
  }): Promise<void> {
    const safeName = (opts.userName || 'there').trim();
    const subject = `Your VNP Reports export failed (${opts.exportLabel})`;
    const html = this.buildFailedHtml({
      safeName,
      exportLabel: opts.exportLabel,
      jobCount: opts.jobCount,
      reason: opts.reason,
    });
    const text =
      `Hi ${safeName},\n\n` +
      `Unfortunately we couldn't build your ${opts.exportLabel} for ` +
      `${opts.jobCount} jobs. Please try again, or contact support if the ` +
      `problem keeps happening.\n\n` +
      `Reason: ${opts.reason}\n\n` +
      `— VNP Reports`;

    await this.transporter.sendMail({
      from: this.fromAddress,
      to: opts.to,
      subject,
      html,
      text,
    });
    this.logger.log(
      `Sent "report failed" email to ${opts.to} (${opts.exportLabel}, ${opts.jobCount} jobs)`,
    );
  }

  /**
   * Send a "Your bulk archive is complete" confirmation email.
   * Called by the async bulk-archive consumer once the DB update finishes.
   */
  async sendBulkArchiveDoneEmail(opts: {
    to: string;
    userName?: string | null;
    action: 'archived' | 'unarchived';
    jobCount: number;
    updatedCount: number;
  }): Promise<void> {
    const safeName = (opts.userName || 'there').trim();
    const subject = `VNP — ${opts.jobCount} job${opts.jobCount === 1 ? '' : 's'} ${opts.action} successfully`;
    const html = `<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background-color:#f4f4f4;color:#333;line-height:1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
    <tr>
      <td style="padding:30px 20px;text-align:center;background:#ffffff;border-bottom:1px solid #eee;">
        <img src="https://argobot-bucket.s3.us-east-2.amazonaws.com/VNP+LOGO_PNG.png" alt="VNP Solutions" style="max-width:200px;height:auto;">
      </td>
    </tr>
    <tr>
      <td style="padding:30px 24px;">
        <h2 style="margin:0 0 16px 0;color:#16a34a;">Bulk ${this.escape(opts.action)} complete</h2>
        <p>Hi ${this.escape(safeName)},</p>
        <p>Your bulk archive request has been processed successfully.</p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;background:#f9fafb;border-radius:6px;padding:16px;width:100%;">
          <tr><td style="padding:4px 0;color:#666;font-size:14px;">Requested</td><td style="padding:4px 0;font-weight:600;">${opts.jobCount} job${opts.jobCount === 1 ? '' : 's'}</td></tr>
          <tr><td style="padding:4px 0;color:#666;font-size:14px;">Updated</td><td style="padding:4px 0;font-weight:600;">${opts.updatedCount} job${opts.updatedCount === 1 ? '' : 's'}</td></tr>
          <tr><td style="padding:4px 0;color:#666;font-size:14px;">Action</td><td style="padding:4px 0;font-weight:600;text-transform:capitalize;">${this.escape(opts.action)}</td></tr>
        </table>
        <p style="font-size:13px;color:#666;">You can now view the updated jobs in the VNP dashboard.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px;text-align:center;background:#fafafa;color:#999;font-size:12px;border-top:1px solid #eee;">
        VNP Reports · automated email, please do not reply
      </td>
    </tr>
  </table>
</body>`;
    const text =
      `Hi ${safeName},\n\n` +
      `Your bulk ${opts.action} request has been processed.\n\n` +
      `Requested: ${opts.jobCount} job(s)\n` +
      `Updated:   ${opts.updatedCount} job(s)\n\n` +
      `— VNP Reports`;

    await this.transporter.sendMail({
      from: this.fromAddress,
      to: opts.to,
      subject,
      html,
      text,
    });
    this.logger.log(
      `Sent "bulk archive done" email to ${opts.to} (${opts.updatedCount}/${opts.jobCount} jobs ${opts.action})`,
    );
  }

  /**
   * Send the daily job-statistics summary email to a list of recipients.
   * Called by the reports scheduler cron every day at noon.
   */
  async sendDailyStatisticsEmail(opts: {
    to: string[];
    stats: ReportsCurrentCounts;
    date: string;
    failedJobsCsv?: { filename: string; content: string } | null;
  }): Promise<void> {
    if (!opts.to.length) return;

    const subject = `VNP Daily Job Statistics — ${opts.date}`;
    const html = this.buildStatisticsHtml(opts.stats, opts.date, !!opts.failedJobsCsv);
    const text = this.buildStatisticsText(opts.stats, opts.date);

    const attachments: nodemailer.SendMailOptions['attachments'] = [];
    if (opts.failedJobsCsv) {
      attachments.push({
        filename: opts.failedJobsCsv.filename,
        content: opts.failedJobsCsv.content,
        contentType: 'text/csv',
      });
    }

    await this.transporter.sendMail({
      from: this.fromAddress,
      to: opts.to.join(', '),
      subject,
      html,
      text,
      ...(attachments.length ? { attachments } : {}),
    });
    this.logger.log(
      `Sent daily statistics email to [${opts.to.join(', ')}] for ${opts.date}`,
    );
  }

  // ---------- private templates -------------------------------------------

  private buildStatisticsHtml(stats: ReportsCurrentCounts, date: string, hasCsv = false): string {
    const rows = [
      { label: 'Pending',          key: 'pending'         },
      { label: 'Running',          key: 'running'         },
      { label: 'Completed',        key: 'completed'       },
      { label: 'Failed',           key: 'failed'          },
      { label: 'Stopped',          key: 'stopped'         },
      { label: 'Nothing to Report',key: 'nothingToReport' },
      { label: 'Manual',           key: 'manual'          },
    ] as const;

    const rowsHtml = rows.map((r) => {
      const item = stats[r.key];
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;">${r.label}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;text-align:right;font-weight:600;">${item.count}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;text-align:right;color:#666;">${item.percentage}%</td>
      </tr>`;
    }).join('');

    return `<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background-color:#f4f4f4;color:#333;line-height:1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
    <tr>
      <td style="padding:30px 20px;text-align:center;background:#ffffff;border-bottom:1px solid #eee;">
        <img src="https://argobot-bucket.s3.us-east-2.amazonaws.com/VNP+LOGO_PNG.png" alt="VNP Solutions" style="max-width:200px;height:auto;">
      </td>
    </tr>
    <tr>
      <td style="padding:30px 24px;">
        <h2 style="margin:0 0 4px 0;color:#222;">Daily Job Statistics</h2>
        <p style="margin:0 0 24px 0;color:#666;font-size:14px;">${this.escape(date)} &mdash; All OTA providers &amp; job types</p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:6px;overflow:hidden;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:10px 12px;text-align:left;font-size:13px;color:#555;font-weight:600;border-bottom:1px solid #eee;">Status</th>
              <th style="padding:10px 12px;text-align:right;font-size:13px;color:#555;font-weight:600;border-bottom:1px solid #eee;">Count</th>
              <th style="padding:10px 12px;text-align:right;font-size:13px;color:#555;font-weight:600;border-bottom:1px solid #eee;">%</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr style="background:#f9fafb;">
              <td style="padding:10px 12px;font-size:14px;font-weight:700;">Total</td>
              <td style="padding:10px 12px;font-size:14px;font-weight:700;text-align:right;">${stats.total}</td>
              <td style="padding:10px 12px;font-size:14px;text-align:right;color:#666;">100%</td>
            </tr>
          </tbody>
        </table>
        ${hasCsv ? `<p style="margin-top:20px;font-size:13px;color:#b91c1c;background:#fff5f5;border-left:3px solid #b91c1c;padding:10px 14px;border-radius:4px;">
          &#x26A0;&#xFE0F; <strong>${stats.failed.count} Failed</strong> and <strong>${stats.nothingToReport.count} Nothing to Report</strong> job${(stats.failed.count + stats.nothingToReport.count) === 1 ? '' : 's'} detected today. See the attached CSV for the full list.
        </p>` : ''}
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px;text-align:center;background:#fafafa;color:#999;font-size:12px;border-top:1px solid #eee;">
        VNP Reports · automated daily summary, please do not reply
      </td>
    </tr>
  </table>
</body>`;
  }

  private buildStatisticsText(stats: ReportsCurrentCounts, date: string): string {
    return (
      `VNP Daily Job Statistics — ${date}\n` +
      `All OTA providers & job types\n\n` +
      `Pending          : ${stats.pending.count} (${stats.pending.percentage}%)\n` +
      `Running          : ${stats.running.count} (${stats.running.percentage}%)\n` +
      `Completed        : ${stats.completed.count} (${stats.completed.percentage}%)\n` +
      `Failed           : ${stats.failed.count} (${stats.failed.percentage}%)\n` +
      `Stopped          : ${stats.stopped.count} (${stats.stopped.percentage}%)\n` +
      `Nothing to Report: ${stats.nothingToReport.count} (${stats.nothingToReport.percentage}%)\n` +
      `Manual           : ${stats.manual.count} (${stats.manual.percentage}%)\n` +
      `─────────────────────────────\n` +
      `Total            : ${stats.total}\n\n` +
      `— VNP Reports`
    );
  }


  private buildReadyHtml(o: {
    safeName: string;
    exportLabel: string;
    jobCount: number;
    downloadUrl: string;
    downloadFileName: string;
    expiresFmt: string;
  }): string {
    return `<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background-color:#f4f4f4;color:#333;line-height:1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
    <tr>
      <td style="padding:30px 20px;text-align:center;background:#ffffff;border-bottom:1px solid #eee;">
        <img src="https://argobot-bucket.s3.us-east-2.amazonaws.com/VNP+LOGO_PNG.png" alt="VNP Solutions" style="max-width:200px;height:auto;">
      </td>
    </tr>
    <tr>
      <td style="padding:30px 24px;">
        <h2 style="margin:0 0 16px 0;color:#222;">Your report is ready</h2>
        <p>Hi ${this.escape(o.safeName)},</p>
        <p>Your <strong>${this.escape(o.exportLabel)}</strong> for ${o.jobCount} job${o.jobCount === 1 ? '' : 's'} has finished generating.</p>
        <p style="text-align:center;margin:28px 0;">
          <a href="${o.downloadUrl}"
             style="display:inline-block;padding:12px 24px;background:#1f6feb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">
            Download report
          </a>
        </p>
        <p style="font-size:13px;color:#666;">
          File: <code>${this.escape(o.downloadFileName)}</code><br/>
          This link expires on <strong>${this.escape(o.expiresFmt)}</strong>.
        </p>
        <p style="font-size:13px;color:#666;">
          If the button above doesn't work, copy this URL into your browser:<br/>
          <span style="word-break:break-all;color:#1f6feb;">${this.escape(o.downloadUrl)}</span>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px;text-align:center;background:#fafafa;color:#999;font-size:12px;border-top:1px solid #eee;">
        VNP Reports · automated email, please do not reply
      </td>
    </tr>
  </table>
</body>`;
  }

  private buildReadyText(o: {
    safeName: string;
    exportLabel: string;
    jobCount: number;
    downloadUrl: string;
    downloadFileName: string;
    expiresFmt: string;
  }): string {
    return (
      `Hi ${o.safeName},\n\n` +
      `Your ${o.exportLabel} for ${o.jobCount} job(s) is ready.\n\n` +
      `Download: ${o.downloadUrl}\n` +
      `File: ${o.downloadFileName}\n` +
      `Link expires on ${o.expiresFmt}.\n\n` +
      `— VNP Reports`
    );
  }

  private buildFailedHtml(o: {
    safeName: string;
    exportLabel: string;
    jobCount: number;
    reason: string;
  }): string {
    return `<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f4f4f4;color:#333;line-height:1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
    <tr>
      <td style="padding:30px 20px;text-align:center;background:#ffffff;border-bottom:1px solid #eee;">
        <img src="https://argobot-bucket.s3.us-east-2.amazonaws.com/VNP+LOGO_PNG.png" alt="VNP Solutions" style="max-width:200px;height:auto;">
      </td>
    </tr>
    <tr>
      <td style="padding:30px 24px;">
        <h2 style="margin:0 0 16px 0;color:#b91c1c;">Your report could not be generated</h2>
        <p>Hi ${this.escape(o.safeName)},</p>
        <p>Unfortunately we couldn't build your <strong>${this.escape(o.exportLabel)}</strong> for ${o.jobCount} job${o.jobCount === 1 ? '' : 's'}. Please try again, or contact support if the problem keeps happening.</p>
        <p style="font-size:13px;color:#666;background:#fafafa;padding:12px 16px;border-radius:6px;border-left:3px solid #b91c1c;">
          <strong>Reason:</strong> ${this.escape(o.reason)}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px;text-align:center;background:#fafafa;color:#999;font-size:12px;border-top:1px solid #eee;">
        VNP Reports · automated email, please do not reply
      </td>
    </tr>
  </table>
</body>`;
  }

  /**
   * Minimal HTML escaping for user-provided strings (name, reason, URL,
   * filename). Prevents the email body from breaking on `<` or `&`.
   */
  private escape(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
