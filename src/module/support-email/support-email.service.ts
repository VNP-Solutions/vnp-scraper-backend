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
import { deriveEmailReplyStatus } from '../job/reply-status.util';
import {
  ISupportEmailRepository,
  ISupportEmailScraperService,
  ISupportEmailService,
  RunSupportEmailJobReplyStatusEntry,
  RunSupportEmailJobResult,
  SupportEmailsForJobResult,
  UpdateSupportEmailReplyStatusResult,
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
    return deriveEmailReplyStatus(outcome.email.reopen);
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

      // Keep the stored email's own reply_status in step with the job's.
      // `storeIfNew` only sets it at insert time, so without this a later
      // run that re-finds the same message (duplicate: true) would update
      // the job's reply_status but leave the existing support_emails row
      // stuck with whatever it was first written as.
      if (result.outcome.status === 'parsed' && result.outcome.storage.recordId) {
        try {
          await this.supportEmailRepository.updateReplyStatus(
            result.outcome.storage.recordId,
            replyStatus,
          );
        } catch (error: any) {
          this.logger.error(
            `Failed to sync reply_status=${replyStatus} onto support email ${result.outcome.storage.recordId} for job ${result.jobId}:`,
            error,
          );
        }
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

  /**
   * Manual override behind PATCH /support-email/:id/reply-status. A
   * mirror-image of the automatic sync in `runJob`: there the job drives
   * the email, here the email (as edited by a human) drives the job.
   */
  async updateSupportEmailReplyStatus(
    id: string,
    replyStatus: ReplyStatus,
  ): Promise<UpdateSupportEmailReplyStatusResult> {
    const email = await this.supportEmailRepository.updateReplyStatus(
      id,
      replyStatus,
    );
    if (!email) {
      throw new NotFoundException(`Support email with ID ${id} not found`);
    }

    let jobUpdated = false;
    if (email.job_id) {
      try {
        const job = await this.jobRepository.updateReplyStatus(
          email.job_id,
          replyStatus,
        );
        jobUpdated = Boolean(job);
      } catch (error: any) {
        this.logger.error(
          `Failed to sync reply_status=${replyStatus} onto job ${email.job_id} from support email ${id}:`,
          error,
        );
      }
    }

    return { email, jobUpdated };
  }
}
