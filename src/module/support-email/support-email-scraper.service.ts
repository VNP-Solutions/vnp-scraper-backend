/**
 * Agoda Partner Support email scraper.
 *
 * For each job it resolves the property's Agoda ID, searches the Agoda label
 * in Gmail for messages mentioning that ID, takes the newest one sent by
 * `PartnerSupport@agoda.com`, and parses its body and any CSV / XLSX
 * attachment.
 *
 * The window is either a rolling number of days or everything since a caller
 * supplied cutoff — the reply-status flow passes the job's completion time
 * (see `resolveReplySearchCutoff`) so it only sees what has arrived since
 * the job last completed.
 *
 * The captured email is persisted once per Gmail message; results are also
 * returned to the caller.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobStatus, SupportEmail } from '@prisma/client';
import { google, type gmail_v1 } from 'googleapis';
import { S3UploadService } from '../../common/utils/s3-upload.util';
import { GoogleOAuthConfig } from '../google-oauth/google-oauth.config';
import { GoogleOAuthService } from '../google-oauth/google-oauth.service';
import { resolveAgodaIdForJob } from '../job/agoda-id.util';
import { IJobRepository } from '../job/job.interface';
import {
  deriveEmailReplyStatus,
  resolveReplySearchCutoff,
} from '../job/reply-status.util';
import { IPropertyRepository } from '../property/property.interface';
import {
  AttachmentParserService,
  collectAttachmentRefs,
  parseAttachmentBuffer,
} from './attachment-parser.service';
import {
  findHeader,
  normalizeSenderAddress,
  parseSupportEmailBody,
} from './email-body-parser';
import { evaluateReopenDecision } from './reopen-rules';
import {
  ISupportEmailRepository,
  ISupportEmailScraperService,
} from './support-email.interface';
import {
  AGODA_PARTNER_SUPPORT_ADDRESS,
  DEFAULT_LOOKBACK_DAYS,
  DEFAULT_SUPPORT_EMAIL_LABEL,
  type BulkSupportEmailResults,
  type CollectBookingAmount,
  type JobSupportEmailResult,
  type ParsedAttachment,
  type ParsedSupportEmail,
  type ReopenSummary,
  type ReparsedAttachment,
  type ReparsedSupportEmail,
  type ScrapeSupportEmailOptions,
  type SupportEmailMessageDirection,
  type SupportEmailOutcome,
} from './support-email.types';

const DEFAULT_MAX_CANDIDATES = 10;

interface CandidateMessage {
  id: string;
  millis: number;
  from: string;
  sender: string;
  receivedAt: string | null;
  direction: SupportEmailMessageDirection;
}

interface GmailAttachmentCache {
  gmail?: gmail_v1.Gmail;
  refs?: ReturnType<typeof collectAttachmentRefs>;
}

function toIsoDate(internalDate: string | null | undefined): string | null {
  if (!internalDate) return null;
  const millis = Number(internalDate);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

@Injectable()
export class SupportEmailScraperService implements ISupportEmailScraperService {
  private readonly logger = new Logger(SupportEmailScraperService.name);

  constructor(
    private readonly googleOAuthConfig: GoogleOAuthConfig,
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly configService: ConfigService,
    private readonly attachmentParserService: AttachmentParserService,
    private readonly s3UploadService: S3UploadService,
    @Inject('ISupportEmailRepository')
    private readonly repository: ISupportEmailRepository,
    @Inject('IJobRepository')
    private readonly jobRepository: IJobRepository,
    @Inject('IPropertyRepository')
    private readonly propertyRepository: IPropertyRepository,
  ) {}

  private getSupportEmailLabel(): string {
    return (
      this.configService.get<string>('AGODA_SUPPORT_EMAIL_LABEL') ||
      DEFAULT_SUPPORT_EMAIL_LABEL
    );
  }

  private async getGmailClient(): Promise<gmail_v1.Gmail> {
    const tokenData = await this.googleOAuthService.getValidCredentials();
    if (!tokenData) {
      throw new Error(
        'Failed to load Gmail credentials. Complete the Google OAuth setup at /google-oauth/auth first.',
      );
    }

    return google.gmail({
      version: 'v1',
      auth: this.googleOAuthConfig.oauth2Client,
    });
  }

  private async getAgodaIdFromJob(jobId: string): Promise<{ agodaId: string } | null> {
    try {
      const job = await this.jobRepository.findById(jobId);
      if (!job) return null;

      const agodaId = await resolveAgodaIdForJob(job, this.propertyRepository);
      return agodaId ? { agodaId } : null;
    } catch (error) {
      this.logger.error(`Error getting agoda_id for job ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Scoped to the Agoda label so the whole conversation is in range, replies
   * and sent mail included. Quoting the Agoda ID stops Gmail from tokenizing
   * it into unrelated numeric matches, and the label is quoted too so a
   * renamed label containing spaces still works.
   *
   * `after:` narrows the window server-side, but Gmail applies it at day
   * granularity, so the exact cutoff is enforced again on the results.
   */
  private buildSearchQuery(
    agodaId: string,
    window: { since?: Date; lookbackDays: number },
  ): string {
    const scope = window.since
      ? `after:${Math.floor(window.since.getTime() / 1000)}`
      : `newer_than:${window.lookbackDays}d`;

    return `label:"${this.getSupportEmailLabel()}" "${agodaId}" ${scope}`;
  }

  /**
   * Loads just enough of each hit to order and attribute it, newest first.
   * Gmail lists newest first already, but ordering is re-derived from
   * `internalDate` so "the last mail" is right even if the listing order
   * shifts.
   */
  private async loadCandidates(
    gmail: gmail_v1.Gmail,
    messageIds: string[],
  ): Promise<CandidateMessage[]> {
    const candidates: CandidateMessage[] = [];

    for (const id of messageIds) {
      try {
        const meta = await gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['Date', 'From'],
        });

        const from =
          findHeader(meta.data.payload?.headers ?? undefined, 'From') ?? '';

        candidates.push({
          id,
          millis: Number(meta.data.internalDate ?? 0),
          from,
          sender: normalizeSenderAddress(from),
          receivedAt: toIsoDate(meta.data.internalDate),
          // Gmail's own SENT label is more reliable than matching the From
          // address against whichever alias the mailbox happens to send as.
          direction: (meta.data.labelIds ?? []).includes('SENT')
            ? 'outgoing'
            : 'incoming',
        });
      } catch (error: any) {
        this.logger.warn(
          `⚠️ Could not read metadata for message ${id}: ${error?.message || String(error)}`,
        );
      }
    }

    return candidates.sort((a, b) => b.millis - a.millis);
  }

  /** Rolls the per-attachment verdicts up into one answer for the email. */
  private summarizeReopen(attachments: ParsedAttachment[]): ReopenSummary {
    const decisions = attachments
      .map((attachment) => attachment.reopenDecision)
      .filter((decision): decision is NonNullable<typeof decision> =>
        Boolean(decision),
      );

    if (decisions.length === 0) {
      return {
        shouldReopen: false,
        reason: 'No tabular attachment to evaluate',
        reopenBookingIds: [],
        collectBookingIds: [],
        collectBookingAmounts: [],
      };
    }

    const dedupe = (ids: string[]) => [...new Set(ids.filter(Boolean))];

    const reopenBookingIds = dedupe(
      decisions.flatMap((decision) =>
        decision.reopen.map((entry) => entry.bookingId),
      ),
    );
    const collectBookingIds = dedupe(
      decisions.flatMap((decision) =>
        decision.collect.map((entry) => entry.bookingId),
      ),
    );

    // One amount per collectable booking, in the order first seen — a
    // booking repeated across attachments keeps its first reading rather
    // than being overwritten by a later, possibly stale, one.
    const collectBookingAmounts: CollectBookingAmount[] = [];
    const seenBookingIds = new Set<string>();
    for (const decision of decisions) {
      // The report's own currency column, when it has one — the amount
      // column itself is always USD (`LP(USD)`, `USD Total Include GST`),
      // this is only ever the *supplier's local* currency, kept for
      // reference alongside the (always-USD) amount.
      const currencyColumn = decision.detectedColumns.currency;

      for (const entry of decision.collect) {
        if (!entry.bookingId || seenBookingIds.has(entry.bookingId)) continue;
        seenBookingIds.add(entry.bookingId);

        if (entry.amount === null) {
          collectBookingAmounts.push({
            bookingId: entry.bookingId,
            amount: null,
            currency: null,
          });
          continue;
        }

        const rawCurrency = currencyColumn
          ? entry.row[currencyColumn]?.trim()
          : '';

        collectBookingAmounts.push({
          bookingId: entry.bookingId,
          amount: String(entry.amount),
          currency: rawCurrency || 'USD',
        });
      }
    }

    const reasonParts: string[] = [];
    if (reopenBookingIds.length > 0) {
      reasonParts.push(
        `${reopenBookingIds.length} booking(s) need the case reopened`,
      );
    }
    if (collectBookingIds.length > 0) {
      reasonParts.push(`${collectBookingIds.length} booking(s) can be collected`);
    }

    return {
      shouldReopen: decisions.some((decision) => decision.shouldReopen),
      reason: reasonParts.join(', ') || 'Nothing outstanding in the report',
      reopenBookingIds,
      collectBookingIds,
      collectBookingAmounts,
    };
  }

  private async buildSupportEmail(
    gmail: gmail_v1.Gmail,
    message: gmail_v1.Schema$Message,
    agodaId: string,
    options: ScrapeSupportEmailOptions,
    includeAttachments: boolean,
    direction: SupportEmailMessageDirection,
  ): Promise<ParsedSupportEmail> {
    const payload = message.payload ?? undefined;
    const headers = payload?.headers ?? undefined;
    const messageId = message.id as string;

    const attachments = includeAttachments
      ? await this.attachmentParserService.downloadAndParseAttachments(
          gmail,
          messageId,
          payload,
          {
            agodaId,
            reopenRules: options.reopenRules,
            // A run that is not writing the record should not leave an
            // orphaned file behind either.
            uploadToS3: options.persist !== false,
          },
        )
      : [];

    return {
      messageId,
      threadId: message.threadId ?? null,
      direction,
      receivedAt: toIsoDate(message.internalDate),
      headers: {
        from: findHeader(headers, 'From') ?? '',
        to: findHeader(headers, 'To'),
        subject: findHeader(headers, 'Subject'),
        date: findHeader(headers, 'Date'),
      },
      body: parseSupportEmailBody(payload),
      attachments,
      reopen: this.summarizeReopen(attachments),
    };
  }

  /**
   * Stores the rest of the labelled conversation — our own submissions and
   * any older replies — so the exchange is on record, not just the one
   * message the reopen rules ran against.
   *
   * Messages already captured by an earlier run are skipped before Gmail is
   * asked for the body, so a repeat scrape costs one cheap database lookup
   * each.
   */
  private async captureRemainingConversation(
    gmail: gmail_v1.Gmail,
    candidates: CandidateMessage[],
    primaryMessageId: string,
    agodaId: string,
    options: ScrapeSupportEmailOptions,
    includeAttachments: boolean,
  ): Promise<{ stored: number; duplicates: number }> {
    let stored = 0;
    let duplicates = 0;

    for (const candidate of candidates) {
      if (candidate.id === primaryMessageId) continue;

      try {
        if (await this.repository.isStored(candidate.id)) {
          duplicates += 1;
          continue;
        }

        const message = await gmail.users.messages.get({
          userId: 'me',
          id: candidate.id,
          format: 'full',
        });

        const email = await this.buildSupportEmail(
          gmail,
          message.data,
          agodaId,
          options,
          includeAttachments,
          candidate.direction,
        );

        const result = await this.repository.storeIfNew(email, {
          agodaId,
          jobId: options.jobId,
          propertyId: options.propertyId,
        });

        if (result.stored) stored += 1;
        else if (result.duplicate) duplicates += 1;
      } catch (error: any) {
        // One unreadable message must not cost us the rest of the
        // conversation.
        this.logger.warn(
          `⚠️ Could not capture conversation message ${candidate.id}: ${error?.message || String(error)}`,
        );
      }
    }

    return { stored, duplicates };
  }

  /**
   * Finds and parses the latest Agoda Partner Support reply for one Agoda ID.
   */
  async scrapeAgodaSupportEmail(
    agodaId: string,
    options: ScrapeSupportEmailOptions = {},
  ): Promise<SupportEmailOutcome> {
    const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
    const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
    const includeAttachments = options.includeAttachments ?? true;
    const since = options.since;
    const windowLabel = since
      ? `since ${since.toISOString()}`
      : `in the last ${lookbackDays} days`;

    const gmail = await this.getGmailClient();
    const query = this.buildSearchQuery(agodaId, { since, lookbackDays });

    this.logger.log(
      `📧 Searching Gmail for Agoda ID ${agodaId} — query: ${query}`,
    );

    const list = await gmail.users.messages.list({
      userId: 'me',
      maxResults: maxCandidates,
      q: query,
    });

    const messageIds = (list.data.messages ?? [])
      .map((message) => message.id)
      .filter((id): id is string => Boolean(id));

    if (messageIds.length === 0) {
      this.logger.log(
        `📭 No emails mentioning Agoda ID ${agodaId} ${windowLabel}`,
      );
      return { status: 'no_email_found' };
    }

    this.logger.log(
      `📬 Found ${messageIds.length} candidate email(s) for Agoda ID ${agodaId}`,
    );

    const loaded = await this.loadCandidates(gmail, messageIds);

    // Gmail resolves `after:` to whole days, so it can hand back mail from
    // earlier on the cutoff day. Re-apply the cutoff exactly.
    const candidates = since
      ? loaded.filter((candidate) => candidate.millis > since.getTime())
      : loaded;

    if (candidates.length === 0) {
      this.logger.log(
        `📭 Nothing new for Agoda ID ${agodaId} ${windowLabel} (discarded by cutoff: ${loaded.length})`,
      );
      return { status: 'no_email_found' };
    }

    // The label covers both directions, so the newest hit is often our own
    // reply. Take the newest message Agoda actually sent rather than
    // stopping at the newest overall and calling it a day.
    const latestReply = candidates.find(
      (candidate) => candidate.sender === AGODA_PARTNER_SUPPORT_ADDRESS,
    );

    if (!latestReply) {
      const newest = candidates[0];
      this.logger.log(
        `↩️ No Partner Support message among the ${candidates.length} hit(s) for Agoda ID ${agodaId}; newest is from ${newest.sender || 'unknown'}`,
      );
      return {
        status: 'not_from_partner_support',
        from: newest.from,
        receivedAt: newest.receivedAt,
      };
    }

    const message = await gmail.users.messages.get({
      userId: 'me',
      id: latestReply.id,
      format: 'full',
    });

    this.logger.log(
      `✅ Latest Partner Support reply for Agoda ID ${agodaId} received ${latestReply.receivedAt}, parsing`,
    );

    const email = await this.buildSupportEmail(
      gmail,
      message.data,
      agodaId,
      options,
      includeAttachments,
      latestReply.direction,
    );

    this.logger.log(
      `📄 Parsed support email for Agoda ID ${agodaId} — caseId=${email.body.caseId}, ` +
        `reservations=${email.body.reservationIds.length}, attachments=${email.attachments.length}, ` +
        `shouldReopen=${email.reopen.shouldReopen}, reopenBookings=${email.reopen.reopenBookingIds.length}, ` +
        `collectBookings=${email.reopen.collectBookingIds.length}`,
    );

    if (options.persist === false) {
      return {
        status: 'parsed',
        email,
        storage: {
          stored: false,
          duplicate: false,
          recordId: null,
          conversationStored: 0,
          conversationDuplicates: 0,
        },
      };
    }

    // Gmail keeps returning the same message for the whole window, so the
    // store is a no-op after the first sighting. This is "the" reply the
    // reopen rules ran against, so it's the one message that gets a
    // reply_status verdict written onto its own row.
    const primaryStorage = await this.repository.storeIfNew(email, {
      agodaId,
      jobId: options.jobId,
      propertyId: options.propertyId,
      replyStatus: deriveEmailReplyStatus(email.reopen),
    });

    const conversation = await this.captureRemainingConversation(
      gmail,
      candidates,
      latestReply.id,
      agodaId,
      options,
      includeAttachments,
    );

    if (conversation.stored > 0) {
      this.logger.log(
        `🗂️ Captured ${conversation.stored} further message(s) from the Agoda ${agodaId} conversation`,
      );
    }

    return {
      status: 'parsed',
      email,
      storage: {
        ...primaryStorage,
        conversationStored: conversation.stored,
        conversationDuplicates: conversation.duplicates,
      },
    };
  }

  /**
   * Reads one stored attachment back from Gmail by message ID. This is a
   * direct fetch, not a search, so no date window can hide it. `refs` caches
   * the message's attachment list across files on the same email.
   */
  private async downloadFromGmail(
    messageId: string,
    filename: string,
    cache: GmailAttachmentCache,
  ): Promise<Buffer> {
    cache.gmail ??= await this.getGmailClient();

    if (!cache.refs) {
      const message = await cache.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });
      cache.refs = collectAttachmentRefs(message.data.payload ?? undefined);
    }

    const ref = cache.refs.find((candidate) => candidate.filename === filename);
    if (!ref) {
      throw new Error(`${filename} is no longer on Gmail message ${messageId}`);
    }

    const response = await cache.gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: ref.attachmentId,
    });
    if (!response.data.data) {
      throw new Error('Gmail returned an empty attachment body');
    }

    return Buffer.from(response.data.data, 'base64url');
  }

  /**
   * Runs the current parser and reopen rules over the attachments of an
   * email that is already stored, without searching Gmail. Each file is
   * read back from its S3 archive, or fetched from its Gmail message when
   * the archive is missing or unreadable.
   */
  async reparseStoredEmail(
    email: SupportEmail,
    agodaId: string,
  ): Promise<ReparsedSupportEmail> {
    const gmailCache: GmailAttachmentCache = {};
    const attachments: ReparsedAttachment[] = [];
    let complete = true;

    for (const stored of email.attachments) {
      const archive = {
        s3Url: stored.s3_url ?? null,
        s3Key: stored.s3_key ?? null,
        uploadError: stored.upload_error ?? undefined,
      };

      if (stored.format === 'unknown') {
        attachments.push({
          filename: stored.filename,
          mimeType: stored.mime_type,
          sizeBytes: stored.size_bytes,
          format: 'unknown',
          columns: [],
          rows: [],
          rowCount: 0,
          parseError: stored.parse_error ?? 'Unsupported attachment type',
          ...archive,
          loadedFrom: null,
        });
        continue;
      }

      let buffer: Buffer | null = null;
      let loadedFrom: ReparsedAttachment['loadedFrom'] = null;
      const loadErrors: string[] = [];

      if (stored.s3_key) {
        try {
          buffer = await this.s3UploadService.downloadBuffer(stored.s3_key);
          loadedFrom = 's3';
        } catch (error: any) {
          loadErrors.push(`S3: ${error?.message || String(error)}`);
        }
      } else {
        loadErrors.push('S3: no archived copy');
      }

      if (!buffer) {
        try {
          buffer = await this.downloadFromGmail(
            email.message_id,
            stored.filename,
            gmailCache,
          );
          loadedFrom = 'gmail';
        } catch (error: any) {
          loadErrors.push(`Gmail: ${error?.message || String(error)}`);
        }
      }

      if (!buffer) {
        complete = false;
        this.logger.warn(
          `⚠️ Could not read back ${stored.filename} for support email ${email.id}: ${loadErrors.join('; ')}`,
        );
        attachments.push({
          filename: stored.filename,
          mimeType: stored.mime_type,
          sizeBytes: stored.size_bytes,
          format: stored.format,
          columns: [],
          rows: [],
          rowCount: 0,
          parseError: `Could not read the file back (${loadErrors.join('; ')})`,
          ...archive,
          loadedFrom: null,
        });
        continue;
      }

      const parsed = parseAttachmentBuffer(
        stored.filename,
        stored.mime_type,
        buffer,
      );
      const attachment: ReparsedAttachment = { ...parsed, ...archive, loadedFrom };
      attachment.reopenDecision = evaluateReopenDecision(attachment, { agodaId });
      attachments.push(attachment);
    }

    return {
      attachments,
      reopen: this.summarizeReopen(attachments),
      complete,
    };
  }

  /**
   * Runs the scrape for a batch of job IDs, isolating per-job failures.
   *
   * Only jobs whose property run finished are worth looking at, and each is
   * read from its own `job_completed_date` so a run reports what has
   * arrived since the job last completed rather than re-reading mail an
   * earlier run already saw. See `resolveReplySearchCutoff` for how jobs
   * completed before `job_completed_date` existed are handled.
   */
  async scrapeSupportEmailsForJobs(
    jobIds: string[],
    options: ScrapeSupportEmailOptions = {},
  ): Promise<BulkSupportEmailResults> {
    const results: BulkSupportEmailResults = {
      processed: [],
      invalid: [],
      errors: [],
    };

    for (const jobId of jobIds) {
      try {
        const job = await this.jobRepository.findById(jobId);
        if (!job) {
          results.invalid.push({ jobId, reason: 'Job not found' });
          continue;
        }

        if (job.job_status !== JobStatus.Completed) {
          results.invalid.push({
            jobId,
            reason: `Job ${jobId} is ${job.job_status}; only Completed jobs have a case to look up.`,
            currentStatus: job.job_status,
          });
          continue;
        }

        const propertyData = await this.getAgodaIdFromJob(jobId);
        if (!propertyData?.agodaId) {
          results.invalid.push({
            jobId,
            reason: `Cannot retrieve a valid agoda_id for job ${jobId}. The property may not have agoda_id assigned or it is "0".`,
            currentStatus: job.job_status,
          });
          continue;
        }

        const since = resolveReplySearchCutoff(job);

        const outcome = await this.scrapeAgodaSupportEmail(
          propertyData.agodaId,
          {
            since,
            ...options,
            jobId,
            propertyId: job.property_id?.toString(),
          },
        );

        const result: JobSupportEmailResult = {
          jobId,
          agodaId: propertyData.agodaId,
          outcome,
        };
        results.processed.push(result);
      } catch (error: any) {
        this.logger.error(
          `Error scraping Agoda support email for job ${jobId}:`,
          error,
        );
        results.errors.push({
          jobId,
          error: error?.message || String(error),
        });
      }
    }

    return results;
  }
}
