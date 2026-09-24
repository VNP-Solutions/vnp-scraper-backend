/**
 * Use-case layer behind `POST /api/agoda/retrive-case-email`.
 *
 * Captures, stores and classifies the Agoda Partner Support reply for a
 * batch of jobs, then writes the derived `reply_status` back onto each job.
 * It takes no action on the contents beyond that — reopening a case or
 * charging a booking is somebody else's job.
 */

import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Job, ReplyStatus, SupportEmail } from '@prisma/client';
import { resolveAgodaIdForJob } from '../job/agoda-id.util';
import { IJobRepository } from '../job/job.interface';
import {
  deriveEmailReplyStatus,
  resolveReplySearchCutoff,
} from '../job/reply-status.util';
import { IPropertyRepository } from '../property/property.interface';
import {
  ISupportEmailRepository,
  ISupportEmailScraperService,
  ISupportEmailService,
  RecheckReplyAttachment,
  RecheckReplyResult,
  RecheckReplyVerdict,
  RunSupportEmailJobReplyStatusEntry,
  RunSupportEmailJobResult,
  SupportEmailsForJobResult,
  UpdateSupportEmailReplyStatusResult,
} from './support-email.interface';
import type {
  ParsedAttachment,
  ReopenSummary,
  ReparsedAttachment,
} from './support-email.types';

/** "17 Sep 2026" — the date format shown to the ParserOps team. */
function formatDay(value: Date | string | null | undefined): string {
  if (!value) return 'an unknown date';
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function toRecheckAttachment(
  attachment: ParsedAttachment | ReparsedAttachment,
  loadedFrom: RecheckReplyAttachment['loadedFrom'],
): RecheckReplyAttachment {
  const decision = attachment.reopenDecision;

  let problem: string | null = null;
  if (attachment.format === 'unknown') {
    problem = 'Not a CSV/XLSX report, so it was ignored.';
  } else if (attachment.parseError) {
    problem = attachment.parseError;
  } else if (decision?.sheetType === 'unknown' && attachment.rowCount > 0) {
    problem =
      "The report's columns were not recognised, so none of its rows could be classified.";
  }

  return {
    filename: attachment.filename,
    loadedFrom,
    sheetType: decision?.sheetType ?? null,
    rowCount: attachment.rowCount,
    collect: decision?.collect.length ?? 0,
    reopen: decision?.reopen.length ?? 0,
    skipped: decision?.skipped.length ?? 0,
    problem,
  };
}

function toVerdict(
  reopen: ReopenSummary,
  replyStatus: ReplyStatus,
): RecheckReplyVerdict {
  return {
    replyStatus,
    collect: reopen.collectBookingIds.length,
    reopen: reopen.reopenBookingIds.length,
  };
}

function describeVerdict(verdict: RecheckReplyVerdict): string {
  return `${verdict.collect} booking(s) to collect, ${verdict.reopen} to reopen`;
}

/** Appended when a report was received but could not be classified. */
function attachmentWarning(attachments: RecheckReplyAttachment[]): string {
  const broken = attachments.filter(
    (attachment) => attachment.loadedFrom !== null && attachment.problem,
  );
  if (broken.length === 0) return '';
  return (
    ` Warning: ${broken.map((attachment) => attachment.filename).join(', ')} ` +
    'could not be read properly — please pass this job to the dev team.'
  );
}

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
    @Inject('IPropertyRepository')
    private readonly propertyRepository: IPropertyRepository,
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

  async recheckReply(jobId: string): Promise<RecheckReplyResult> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    const agodaId = await resolveAgodaIdForJob(job, this.propertyRepository);
    if (!agodaId) {
      return {
        jobId,
        agodaId: null,
        source: 'stored_email',
        updated: false,
        message:
          "This job's property has no Agoda ID, so there is no Agoda reply to look up. " +
          'Add the Agoda ID to the property and try again.',
        supportEmailId: null,
        caseId: null,
        receivedAt: null,
        before: null,
        after: null,
        attachments: [],
      };
    }

    const cutoff = resolveReplySearchCutoff(job);
    const stored =
      await this.supportEmailRepository.findLatestPartnerSupportReply(agodaId);

    // A reply from before this run completed answers an earlier run, not
    // this one, so only a newer message in Gmail can settle this run.
    if (!stored || (stored.received_at && stored.received_at < cutoff)) {
      return this.recheckFromGmail(job, agodaId, cutoff);
    }

    return this.recheckStoredReply(job, agodaId, stored);
  }

  private async recheckStoredReply(
    job: Job,
    agodaId: string,
    stored: SupportEmail,
  ): Promise<RecheckReplyResult> {
    const reparsed = await this.scraperService.reparseStoredEmail(
      stored,
      agodaId,
    );
    const attachments = reparsed.attachments.map((attachment) =>
      toRecheckAttachment(attachment, attachment.loadedFrom),
    );

    const base = {
      jobId: job.id,
      agodaId,
      source: 'stored_email' as const,
      supportEmailId: stored.id,
      caseId: stored.case_id,
      receivedAt: stored.received_at,
      before: {
        replyStatus: stored.reply_status,
        collect: stored.collect_booking_ids.length,
        reopen: stored.reopen_booking_ids.length,
      },
      attachments,
    };
    const replyLabel = `Agoda's reply from ${formatDay(stored.received_at)}${stored.case_id ? ` (case ${stored.case_id})` : ''}`;

    if (!reparsed.complete) {
      return {
        ...base,
        updated: false,
        after: null,
        message:
          `Could not open the report attached to ${replyLabel}, so nothing was changed. ` +
          'Please pass this job to the dev team.',
      };
    }

    const replyStatus = deriveEmailReplyStatus(reparsed.reopen);
    await this.supportEmailRepository.updateParsedResult(stored.id, {
      attachments: reparsed.attachments,
      reopen: reparsed.reopen,
      replyStatus,
    });
    await this.jobRepository.updateReplyStatus(job.id, replyStatus);

    const after = toVerdict(reparsed.reopen, replyStatus);
    const changed =
      base.before.collect !== after.collect ||
      base.before.reopen !== after.reopen ||
      base.before.replyStatus !== after.replyStatus;

    const summary =
      reparsed.attachments.length === 0
        ? `${replyLabel} has no report attached, so there is nothing to collect or reopen.`
        : `Recalculated ${replyLabel}: ${describeVerdict(after)}.`;

    this.logger.log(
      `🔁 Rechecked support email ${stored.id} for job ${job.id}: ` +
        `collect ${base.before.collect}→${after.collect}, reopen ${base.before.reopen}→${after.reopen}, ` +
        `replyStatus ${base.before.replyStatus ?? 'n/a'}→${replyStatus}`,
    );

    return {
      ...base,
      updated: true,
      after,
      message:
        `${summary} Status is now ${replyStatus}.` +
        (changed
          ? ` Before this check it showed ${describeVerdict(base.before)}.`
          : ' Nothing changed.') +
        attachmentWarning(attachments),
    };
  }

  /** No reply stored for this run yet — fall back to the normal Gmail capture. */
  private async recheckFromGmail(
    job: Job,
    agodaId: string,
    cutoff: Date,
  ): Promise<RecheckReplyResult> {
    const base = {
      jobId: job.id,
      agodaId,
      source: 'gmail_search' as const,
      supportEmailId: null,
      caseId: null,
      receivedAt: null,
      before: null,
      after: null,
      attachments: [],
    };

    const { results } = await this.runJob([job.id]);

    const invalid = results.invalid[0];
    if (invalid) {
      return { ...base, updated: false, message: invalid.reason };
    }

    const failure = results.errors[0];
    if (failure) {
      return {
        ...base,
        updated: false,
        message:
          `Something went wrong while searching Gmail (${failure.error}). ` +
          'Please pass this job to the dev team.',
      };
    }

    const outcome = results.processed[0]?.outcome;

    if (outcome?.status === 'parsed') {
      const { email } = outcome;
      const replyStatus = deriveEmailReplyStatus(email.reopen);
      const after = toVerdict(email.reopen, replyStatus);
      const attachments = email.attachments.map((attachment) =>
        toRecheckAttachment(
          attachment,
          attachment.format === 'unknown' ? null : 'gmail',
        ),
      );

      return {
        ...base,
        updated: true,
        supportEmailId: outcome.storage.recordId,
        caseId: email.body.caseId,
        receivedAt: email.receivedAt,
        after,
        attachments,
        message:
          `Found Agoda's reply from ${formatDay(email.receivedAt)} in Gmail` +
          `${email.body.caseId ? ` (case ${email.body.caseId})` : ''}: ${describeVerdict(after)}. ` +
          `Status is now ${replyStatus}.` +
          attachmentWarning(attachments),
      };
    }

    if (outcome?.status === 'not_from_partner_support') {
      return {
        ...base,
        updated: false,
        message:
          `The newest email about hotel ${agodaId} since ${formatDay(cutoff)} is from ${outcome.from}, ` +
          "not Agoda Partner Support, so Agoda hasn't replied to this run yet.",
      };
    }

    return {
      ...base,
      updated: false,
      message:
        `No reply from Agoda has arrived in Gmail since ${formatDay(cutoff)}. ` +
        "If you can see Agoda's reply in Gmail, check that it has the Agoda label " +
        `and mentions hotel ID ${agodaId}, then pass this job to the dev team.`,
    };
  }
}
