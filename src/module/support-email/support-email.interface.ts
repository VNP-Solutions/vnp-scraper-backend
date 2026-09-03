import type { ReplyStatus, SupportEmail } from '@prisma/client';
import type {
  BulkSupportEmailResults,
  ParsedSupportEmail,
  ScrapeSupportEmailOptions,
  SupportEmailOutcome,
} from './support-email.types';

export interface StoreSupportEmailContext {
  agodaId: string;
  jobId?: string;
  propertyId?: string;
  /**
   * RepliedRed / RepliedGreen verdict for this message, set only when it is
   * "the" Partner Support reply a run evaluated (see
   * `deriveEmailReplyStatus` in `reply-status.util.ts`). Left undefined for
   * conversation messages and outgoing mail, which get stored with
   * `reply_status: null`.
   */
  replyStatus?: ReplyStatus;
}

export interface StoreSupportEmailResult {
  stored: boolean;
  recordId: string | null;
  /** True when this message was already in the database from an earlier run. */
  duplicate: boolean;
}

/** Persistence layer — dedup on Gmail's `message_id` via `support_emails`. */
export interface ISupportEmailRepository {
  isStored(messageId: string): Promise<boolean>;
  storeIfNew(
    email: ParsedSupportEmail,
    context: StoreSupportEmailContext,
  ): Promise<StoreSupportEmailResult>;
  /**
   * Newest inbound Partner Support reply already on record for a property,
   * optionally restricted to after a cutoff. Read by
   * `POST /api/agoda/send-to-retrieval` so it acts on the same reply the
   * capture endpoint stored, without going back to Gmail.
   */
  findLatestPartnerSupportReply(
    agodaId: string,
    options?: { since?: Date | null },
  ): Promise<SupportEmail | null>;
  /** Single stored email by its own `support_emails` document id. */
  findById(id: string): Promise<SupportEmail | null>;
  /**
   * Every stored email whose `job_id` matches the given job — i.e. every
   * message a run of that specific job captured (dedup on `message_id`
   * means a message stays tagged with whichever job's run captured it
   * first). Newest first.
   */
  findAllByJobId(jobId: string): Promise<SupportEmail[]>;
  /**
   * Syncs the verdict onto an already-stored row. `storeIfNew` only sets
   * `reply_status` at insert time, so this is what keeps an existing
   * duplicate row's verdict in step with the job's `reply_status` on a
   * later run that re-finds the same message. Returns null (does not
   * throw) when the id does not exist.
   */
  updateReplyStatus(
    id: string,
    replyStatus: ReplyStatus,
  ): Promise<SupportEmail | null>;
}

/** Gmail search + parse orchestration for one Agoda ID or a batch of jobs. */
export interface ISupportEmailScraperService {
  scrapeAgodaSupportEmail(
    agodaId: string,
    options?: ScrapeSupportEmailOptions,
  ): Promise<SupportEmailOutcome>;
  scrapeSupportEmailsForJobs(
    jobIds: string[],
    options?: ScrapeSupportEmailOptions,
  ): Promise<BulkSupportEmailResults>;
}

export interface RunSupportEmailJobReplyStatusEntry {
  jobId: string;
  replyStatus: string;
}

export interface RunSupportEmailJobResult {
  results: BulkSupportEmailResults & {
    replyStatuses: RunSupportEmailJobReplyStatusEntry[];
  };
  message: string;
}

/**
 * Result of looking up every stored email captured by a job's run(s), for
 * display purposes (GET /jobs/:jobId/support-email). `emails` is `[]` when
 * nothing has been captured yet for this job.
 */
export interface SupportEmailsForJobResult {
  jobId: string;
  emails: SupportEmail[];
}

/**
 * Result of a manual reply_status override (PATCH /support-email/:id/reply-status).
 * `jobUpdated` is false when the email has no `job_id` on record, or the
 * job it points to no longer exists.
 */
export interface UpdateSupportEmailReplyStatusResult {
  email: SupportEmail;
  jobUpdated: boolean;
}

/** Use-case layer behind POST /api/agoda/retrive-case-email. */
export interface ISupportEmailService {
  runJob(jobIds: string[]): Promise<RunSupportEmailJobResult>;
  /**
   * Read-only lookup behind GET /jobs/:jobId/support-email. Never scrapes
   * Gmail — returns every stored email whose `job_id` matches this job
   * (newest first), not just the latest matching reply.
   */
  getSupportEmailsForJob(jobId: string): Promise<SupportEmailsForJobResult>;
  /**
   * Read-only lookup behind GET /support-email/:id. Fetches a single
   * `support_emails` document by its own id, for a detail view once the
   * frontend already has an id to look up (e.g. picked from the list
   * returned by `getSupportEmailsForJob`). Throws NotFoundException when
   * the id does not exist.
   */
  getSupportEmailById(id: string): Promise<SupportEmail>;
  /**
   * Manual override behind PATCH /support-email/:id/reply-status. Writes
   * the given status onto the support_emails row, then — if it has a
   * job_id — writes the same status onto that job's reply_status too, so a
   * human correction never leaves the two out of sync. Throws
   * NotFoundException when the email id does not exist.
   */
  updateSupportEmailReplyStatus(
    id: string,
    replyStatus: ReplyStatus,
  ): Promise<UpdateSupportEmailReplyStatusResult>;
}
