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

/** Use-case layer behind POST /api/agoda/retrive-case-email. */
export interface ISupportEmailService {
  runJob(jobIds: string[]): Promise<RunSupportEmailJobResult>;
}
