/**
 * Use-case layer behind `POST /api/agoda/retrive-case-email`.
 *
 * Captures, stores and classifies the Agoda Partner Support reply for a
 * batch of jobs, then writes the derived `reply_status` back onto each job.
 * It takes no action on the contents beyond that — reopening a case or
 * charging a booking is somebody else's job.
 */

import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ReplyStatus, SupportEmail } from '@prisma/client';
import { IJobRepository } from '../job/job.interface';
import {
  ISupportEmailRepository,
  ISupportEmailScraperService,
  ISupportEmailService,
  RunSupportEmailJobReplyStatusEntry,
  RunSupportEmailJobResult,
  SupportEmailsForJobResult,
} from './support-email.interface';

@Injectable()
export class SupportEmailService implements ISupportEmailService {
  private readonly logger = new Logger(SupportEmailService.name);

  constructor(
    @Inject('ISupportEmailScraperService')
    private readonly scraperService: ISupportEmailScraperService,
    @Inject('IJobRepository')
    private readonly jobRepository: IJobRepository,
    @Inject('ISupportEmailRepository')
    private readonly supportEmailRepository: ISupportEmailRepository,
  ) {}

  /**
   * Anything other than a parsed Partner Support reply means Agoda has not
   * answered this run yet; `reply_deadline_at` (set when the job completed)
   * is what says whether that is now overdue.
   */
  private deriveReplyStatus(
    outcome: RunSupportEmailJobResult['results']['processed'][number]['outcome'],
  ): ReplyStatus {
    if (outcome.status !== 'parsed') return ReplyStatus.NoReplied;

    const { shouldReopen, reopenBookingIds } = outcome.email.reopen;
    return shouldReopen && reopenBookingIds.length > 0
      ? ReplyStatus.RepliedRed
      : ReplyStatus.RepliedGreen;
  }

  async runJob(jobIds: string[]): Promise<RunSupportEmailJobResult> {
    const results = await this.scraperService.scrapeSupportEmailsForJobs(
      jobIds,
    );

    const replyStatuses: RunSupportEmailJobReplyStatusEntry[] = [];

    for (const result of results.processed) {
      const replyStatus = this.deriveReplyStatus(result.outcome);

      try {
        await this.jobRepository.updateReplyStatus(result.jobId, replyStatus);
      } catch (error: any) {
        this.logger.error(
          `Failed to write reply_status=${replyStatus} for job ${result.jobId}:`,
          error,
        );
      }

      replyStatuses.push({ jobId: result.jobId, replyStatus });
    }

    const parsed = results.processed.filter(
      (result) => result.outcome.status === 'parsed',
    );
    const withoutReply = results.processed.length - parsed.length;

    const newlyStored = parsed.filter(
      (result) =>
        result.outcome.status === 'parsed' && result.outcome.storage.stored,
    ).length;

    const conversationStored = parsed.reduce(
      (sum, result) =>
        result.outcome.status === 'parsed'
          ? sum + result.outcome.storage.conversationStored
          : sum,
      0,
    );

    const red = replyStatuses.filter(
      (entry) => entry.replyStatus === ReplyStatus.RepliedRed,
    ).length;
    const green = replyStatuses.filter(
      (entry) => entry.replyStatus === ReplyStatus.RepliedGreen,
    ).length;

    const message =
      `Processed ${jobIds.length} jobs. ${parsed.length} support email(s) captured ` +
      `(${newlyStored} newly stored, ${parsed.length - newlyStored} already on record), ` +
      `${conversationStored} further conversation message(s) captured, ${green} RepliedGreen, ` +
      `${red} RepliedRed, ${withoutReply} without a Partner Support reply, ` +
      `${results.invalid.length} invalid, ${results.errors.length} with errors.`;

    return {
      message,
      results: { ...results, replyStatuses },
    };
  }

  /**
   * Read-only lookup for the dashboard — never talks to Gmail. Returns
   * every stored email whose `job_id` matches this job (newest first), not
   * just the latest matching reply.
   */
  async getSupportEmailsForJob(
    jobId: string,
  ): Promise<SupportEmailsForJobResult> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    const emails = await this.supportEmailRepository.findAllByJobId(jobId);

    return { jobId, emails };
  }

  async getSupportEmailById(id: string): Promise<SupportEmail> {
    const email = await this.supportEmailRepository.findById(id);
    if (!email) {
      throw new NotFoundException(`Support email with ID ${id} not found`);
    }
    return email;
  }
}
