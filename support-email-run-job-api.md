# `POST /api/agoda/support-email-run-job` — Complete Port Guide

Everything needed to rebuild this endpoint in another project that shares the
same MongoDB. Source is given verbatim where it must match exactly, and as a
contract where you should adapt it to the host project's conventions.

Stack assumed: **Node 18+, TypeScript (ESM), Express 5, Mongoose 8**.

---

## 1. What the endpoint does

Given a list of job IDs, for each one:

1. Reject the job unless `job_status === "Completed"`.
2. Resolve the property's `agoda_id` from the job's `property_id`.
3. Search Gmail for messages under the Agoda label mentioning that Agoda ID,
   **starting from the job's `updatedAt`** rather than a fixed window.
4. Pick the newest message actually sent by `PartnerSupport@agoda.com`.
5. Parse its body (Case ID, PropertyID, reservation IDs) and download, parse and
   S3-archive any CSV / XLSX attachment.
6. Run the reopen rules over each attachment — **only to classify the reply**.
7. Store the email in `support_emails`, deduplicated on Gmail's `message_id`,
   then store the rest of the labelled conversation the same way.
8. Write `reply_status` back onto the job: `RepliedRed`, `RepliedGreen` or
   `NoReplied`.

**It takes no action on the contents.** Nothing is queued, no browser runs, no
retrievals are created. It captures, stores and classifies.

### Reply status meaning

| Value | Condition |
| --- | --- |
| `RepliedGreen` | Agoda replied and no booking needs the case reopened |
| `RepliedRed` | Agoda replied and at least one booking needs the case reopened |
| `NoReplied` | Nothing came back for this run |

`NoReplied` covers both "too early" and "Agoda never answered". The difference
is `reply_deadline_at` on the job: every completed property run sets it to its
finish time plus 48 hours, so `now > reply_deadline_at` means overdue.

---

## 2. Dependencies

```bash
npm install express mongoose googleapis papaparse xlsx @aws-sdk/client-s3 dotenv
npm install -D typescript @types/express @types/node @types/papaparse
```

`xlsx` has no bundled types; it ships its own.

---

## 3. Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URI` | MongoDB connection string — must be the **same database** as the scraper |
| `CLIENT_ID` | Google OAuth client ID |
| `CLIENT_SECRET` | Google OAuth client secret |
| `REDIRECT_URI` | Google OAuth redirect URI |
| `TOKEN_PATH` | Local cache path for the Google token, e.g. `token.json` |
| `AWS_S3_BUCKET` | Bucket holding the shared Google OAuth token |
| `S3_TOKEN_KEY` | Token object key, defaults to `keyspace/token.json` |
| `AWS_REGION` | AWS region |
| `AWS_ACCESS_KEY_ID` | Credentials for the attachment archive upload |
| `AWS_SECRET_ACCESS_KEY` | Credentials for the attachment archive upload |
| `S3_BUCKET_NAME` | Bucket for archived attachments, defaults to `vnpstorage` |
| `AGODA_SUPPORT_EMAIL_LABEL` | Optional; defaults to `agoda-responses` |

**The Google token is shared through S3, not per-project.** Both projects read
the same object, so the OAuth consent only has to be done once. The required
scope is `https://www.googleapis.com/auth/gmail.readonly`.

---

## 4. Collections touched

| Collection | Access | Notes |
| --- | --- | --- |
| `jobs` | read + write | Reads `job_status`, `property_id`, `updatedAt`; writes `reply_status` |
| `properties` | read | Reads `agoda_id` |
| `support_emails` | write | Created by this feature; `message_id` is uniquely indexed |

If `support_emails` already exists in the shared database, **do not redefine the
schema differently** — reuse the definition in §6.1 exactly.

---

## 5. File layout to create

```
src/
  models/
    support-email.model.ts        (§6.1  — verbatim)
    job.model.ts                  (§6.2  — add fields to the host project's model)
    property.model.ts             (§6.3  — contract only)
  services/
    support-email.service.ts      (§6.4  — verbatim)
    job.service.ts                (§6.5  — add methods)
  agoda/support-email/
    support-email.types.ts        (§7.1  — verbatim)
    email-body-parser.ts          (§7.2  — verbatim)
    reopen-rules.ts               (§7.3  — verbatim)
    attachment-storage.ts         (§7.4  — verbatim)
    attachment-parser.ts          (§7.5  — verbatim)
    support-email-scraper.ts      (§7.6  — verbatim)
  config/
    google-config.ts              (§8.1  — verbatim)
  common/
    log-helper.ts                 (§8.2  — minimal version provided)
    s3-token.ts                   (§8.3  — verbatim)
    load-token.ts                 (§8.4  — minimal version provided)
  app.ts                          (§9    — route handler)
```

---

## 6. Models and services

### 6.1 `src/models/support-email.model.ts` — verbatim

```ts
import mongoose, { Document, Schema, Types } from "mongoose";

export type SupportEmailAttachmentFormat = "csv" | "xlsx" | "unknown";

export type SupportEmailDirection = "incoming" | "outgoing";

/**
 * Metadata for one CSV / XLSX file Agoda attached to its reply. The parsed rows
 * are deliberately not kept: the untouched original is archived to S3, and rows
 * stored here would be an unindexable second copy that goes stale as soon as
 * the reopen rules change.
 */
export interface ISupportEmailAttachment {
  filename: string;
  mime_type: string;
  size_bytes: number;
  format: SupportEmailAttachmentFormat;
  /** Header names exactly as they appear in the file. */
  columns: string[];
  /** How many rows the file held. The rows themselves live in S3, not here. */
  row_count: number;
  /** Which report layout the reopen rules recognised. */
  sheet_type?: string;
  parse_error?: string;
  /** Archived copy of the original file Agoda sent. */
  s3_url?: string | null;
  s3_key?: string | null;
  /** Why the archive upload failed, when it did. */
  upload_error?: string;
}

/**
 * One message from the labelled Agoda conversation — Agoda's replies and our
 * own submissions alike — captured from Gmail and kept so the same message is
 * never processed twice. `message_id` is Gmail's own immutable ID and is the
 * deduplication key. Only the newest incoming reply drives the reopen rules;
 * the rest are stored purely as a record of the exchange.
 */
export interface ISupportEmail extends Document {
  _id: Types.ObjectId;
  message_id: string;
  thread_id?: string | null;
  /** `outgoing` when Gmail marked the message as sent by us. */
  direction: SupportEmailDirection;
  agoda_id: string;
  /** Job whose run first captured this email. */
  job_id?: Types.ObjectId;
  property_id?: Types.ObjectId;

  from_address: string;
  to_address?: string | null;
  subject?: string | null;
  /** Raw `Date` header as Agoda sent it. */
  date_header?: string | null;
  /** Gmail `internalDate`, i.e. when the message actually arrived. */
  received_at?: Date | null;

  body_text: string;
  case_id?: string | null;
  property_name?: string | null;
  city?: string | null;
  country?: string | null;
  reservation_ids: string[];
  partner_email?: string | null;

  attachments: ISupportEmailAttachment[];

  should_reopen: boolean;
  reopen_booking_ids: string[];
  collect_booking_ids: string[];

  createdAt: Date;
  updatedAt: Date;
}

const SupportEmailAttachmentSchema = new Schema<ISupportEmailAttachment>(
  {
    filename: { type: String, required: true },
    mime_type: { type: String, required: true },
    size_bytes: { type: Number, required: true, default: 0 },
    format: {
      type: String,
      enum: ["csv", "xlsx", "unknown"],
      required: true,
    },
    columns: { type: [String], default: [] },
    row_count: { type: Number, required: true, default: 0 },
    sheet_type: { type: String, required: false },
    parse_error: { type: String, required: false },
    s3_url: { type: String, required: false, default: null },
    s3_key: { type: String, required: false, default: null },
    upload_error: { type: String, required: false },
  },
  { _id: false }
);

const SupportEmailSchema = new Schema<ISupportEmail>(
  {
    message_id: {
      type: String,
      required: true,
      // Sole dedup key; `unique` already builds the index.
      unique: true,
    },
    thread_id: { type: String, required: false },
    direction: {
      type: String,
      enum: ["incoming", "outgoing"],
      required: true,
      default: "incoming",
    },
    agoda_id: { type: String, required: true },
    job_id: { type: Schema.Types.ObjectId, ref: "Job", required: false },
    property_id: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: false,
    },

    from_address: { type: String, required: true },
    to_address: { type: String, required: false },
    subject: { type: String, required: false },
    date_header: { type: String, required: false },
    received_at: { type: Date, required: false },

    body_text: { type: String, default: "" },
    case_id: { type: String, required: false },
    property_name: { type: String, required: false },
    city: { type: String, required: false },
    country: { type: String, required: false },
    reservation_ids: { type: [String], default: [] },
    partner_email: { type: String, required: false },

    attachments: { type: [SupportEmailAttachmentSchema], default: [] },

    should_reopen: { type: Boolean, default: false },
    reopen_booking_ids: { type: [String], default: [] },
    collect_booking_ids: { type: [String], default: [] },
  },
  {
    timestamps: true,
    collection: "support_emails",
  }
);

SupportEmailSchema.index({ agoda_id: 1, received_at: -1 });
SupportEmailSchema.index({ case_id: 1 });

export const SupportEmail = mongoose.model<ISupportEmail>(
  "SupportEmail",
  SupportEmailSchema
);
```

### 6.2 `src/models/job.model.ts` — fields to add

The host project already has a `jobs` model. **Add** these to it; do not
recreate the whole schema.

```ts
/**
 * Where the job stands with Agoda Partner Support, judged from the newest reply
 * to land after the property run.
 */
export enum ReplyStatus {
  /** Nothing back from Agoda yet. Past `reply_deadline_at` it is overdue. */
  NoReplied = "NoReplied",
  /** Agoda replied and at least one booking needs the case reopened. */
  RepliedRed = "RepliedRed",
  /** Agoda replied and nothing needs reopening — the balance is collectable. */
  RepliedGreen = "RepliedGreen",
}

/** Grace period Agoda gets to reply before a job counts as unanswered. */
export const REPLY_DEADLINE_HOURS = 48;
```

Interface additions:

```ts
  reply_status?: ReplyStatus;
  /**
   * When Agoda's reply stops being merely absent and starts being late — the
   * property run's completion plus `REPLY_DEADLINE_HOURS`. Rewritten every time
   * the job completes, so a rerun restarts the clock.
   */
  reply_deadline_at?: Date | null;
```

Schema additions:

```ts
    reply_status: {
      type: String,
      enum: Object.values(ReplyStatus),
      required: false,
      default: ReplyStatus.NoReplied,
    },
    reply_deadline_at: {
      type: Date,
      required: false,
      default: null,
    },
```

The endpoint also relies on these existing fields: `job_status` (enum including
`"Completed"`), `property_id` (ObjectId), and Mongoose `timestamps: true` so
`updatedAt` is maintained.

### 6.3 `src/models/property.model.ts` — contract only

Only one field is read. The collection is `properties`, and the field is a
**string**, not a number:

```ts
  agoda_id?: string;   // e.g. "2462187"; "0" is treated as unset
```

### 6.4 `src/services/support-email.service.ts` — verbatim

```ts
/**
 * Persists the Agoda Partner Support emails pulled from Gmail.
 *
 * Gmail's `message_id` is the deduplication key: the same message can surface in
 * several runs, but it is only ever stored once. Nothing is overwritten on a
 * repeat sighting.
 */

import { Types } from "mongoose";
import { dualLogError, dualLogInfo } from "../common/log-helper.js";
import {
  ISupportEmailAttachment,
  SupportEmail,
} from "../models/support-email.model.js";
import type { SupportEmail as ParsedSupportEmail } from "../agoda/support-email/support-email.types.js";

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

function toObjectId(value?: string): Types.ObjectId | undefined {
  if (!value || !Types.ObjectId.isValid(value)) return undefined;
  return new Types.ObjectId(value);
}

/**
 * Only metadata is kept. The rows themselves stay in the archived file on S3,
 * so the record cannot drift from what Agoda actually sent.
 */
function toStorableAttachments(
  email: ParsedSupportEmail
): ISupportEmailAttachment[] {
  return email.attachments.map((attachment) => ({
    filename: attachment.filename,
    mime_type: attachment.mimeType,
    size_bytes: attachment.sizeBytes,
    format: attachment.format,
    columns: attachment.columns,
    row_count: attachment.rowCount,
    sheet_type: attachment.reopenDecision?.sheetType,
    parse_error: attachment.parseError,
    s3_url: attachment.s3Url ?? null,
    s3_key: attachment.s3Key ?? null,
    upload_error: attachment.uploadError,
  }));
}

export class SupportEmailService {
  /** Whether this Gmail message has already been captured. */
  async isStored(messageId: string): Promise<boolean> {
    const existing = await SupportEmail.findOne({ message_id: messageId })
      .select("_id")
      .lean();
    return Boolean(existing);
  }

  /**
   * Stores the email unless its `message_id` is already on record.
   * Never throws — a storage problem must not fail the scrape.
   */
  async storeIfNew(
    email: ParsedSupportEmail,
    context: StoreSupportEmailContext
  ): Promise<StoreSupportEmailResult> {
    try {
      const existing = await SupportEmail.findOne({
        message_id: email.messageId,
      })
        .select("_id")
        .lean();

      if (existing) {
        await dualLogInfo(
          `🗃️ Support email ${email.messageId} already stored, skipping`,
          { agodaId: context.agodaId, jobId: context.jobId }
        );
        return {
          stored: false,
          recordId: String(existing._id),
          duplicate: true,
        };
      }

      const created = await SupportEmail.create({
        message_id: email.messageId,
        thread_id: email.threadId,
        direction: email.direction,
        agoda_id: context.agodaId,
        job_id: toObjectId(context.jobId),
        property_id: toObjectId(context.propertyId),

        from_address: email.headers.from,
        to_address: email.headers.to,
        subject: email.headers.subject,
        date_header: email.headers.date,
        received_at: email.receivedAt ? new Date(email.receivedAt) : null,

        body_text: email.body.text,
        case_id: email.body.caseId,
        property_name: email.body.propertyName,
        city: email.body.city,
        country: email.body.country,
        reservation_ids: email.body.reservationIds,
        partner_email: email.body.partnerEmail,

        attachments: toStorableAttachments(email),

        should_reopen: email.reopen.shouldReopen,
        reopen_booking_ids: email.reopen.reopenBookingIds,
        collect_booking_ids: email.reopen.collectBookingIds,
      });

      await dualLogInfo(`🗃️ Stored support email ${email.messageId}`, {
        agodaId: context.agodaId,
        jobId: context.jobId,
        direction: email.direction,
        caseId: email.body.caseId,
        attachmentCount: email.attachments.length,
        recordId: String(created._id),
      });

      return { stored: true, recordId: String(created._id), duplicate: false };
    } catch (error: any) {
      // A concurrent run inserted the same message between our check and write.
      if (error?.code === 11000) {
        return { stored: false, recordId: null, duplicate: true };
      }

      await dualLogError(
        `Failed to store support email ${email.messageId}:`,
        error,
        { agodaId: context.agodaId, jobId: context.jobId }
      );
      return { stored: false, recordId: null, duplicate: false };
    }
  }
}

export const supportEmailService = new SupportEmailService();
```

### 6.5 `src/services/job.service.ts` — methods to add

Three things the host project's job service must expose.

**a) `getJobById`** — plain `Job.findById`.

**b) `getAgodaIdFromJob`** — resolves the property's Agoda ID:

```ts
async getAgodaIdFromJob(jobId: string): Promise<{ agodaId: string } | null> {
  try {
    const job = await Job.findById(new Types.ObjectId(jobId));
    if (!job?.property_id) return null;

    const property = await Property.findById(job.property_id);
    if (!property?.agoda_id || property.agoda_id === "0") return null;

    return { agodaId: property.agoda_id };
  } catch (error) {
    console.error(`Error getting agoda_id for job ${jobId}:`, error);
    return null;
  }
}
```

**c) `updateJobReplyStatus`**:

```ts
/** Records how Agoda answered, derived from the newest Partner Support reply. */
async updateJobReplyStatus(
  jobId: string,
  replyStatus: ReplyStatus
): Promise<IJob | null> {
  try {
    const objectId = new Types.ObjectId(jobId);
    const updatedJob = await Job.findByIdAndUpdate(
      objectId,
      { reply_status: replyStatus, updatedAt: new Date() },
      { new: true }
    ).exec();

    if (!updatedJob) {
      console.error(`Job not found: ${jobId}`);
      return null;
    }

    console.log(`✅ Updated reply_status to ${replyStatus} for job: ${jobId}`);
    return updatedJob;
  } catch (error) {
    console.error(`Error updating reply_status for job ${jobId}:`, error);
    return null;
  }
}
```

**d) The 48-hour clock.** Wherever the host project sets `job_status` to
`Completed`, it must also restart the reply wait. In the scraper this is a
helper mixed into every status-update path:

```ts
/**
 * Fields that restart the Agoda reply wait. A finished run is the point from
 * which a reply can be expected, so completing puts the job back to
 * `NoReplied` and starts a fresh deadline — a rerun therefore does not
 * inherit the previous run's verdict.
 */
private replyWaitFields(status: JobStatus): Record<string, unknown> {
  if (status !== JobStatus.Completed) return {};

  return {
    reply_status: ReplyStatus.NoReplied,
    reply_deadline_at: new Date(
      Date.now() + REPLY_DEADLINE_HOURS * 60 * 60 * 1000
    ),
  };
}
```

Applied with `Object.assign(updateData, this.replyWaitFields(status))` before
the `findByIdAndUpdate` call.

> **If the property run lives only in the original scraper project**, skip (d)
> entirely — that project already writes these fields, and this one just reads
> `reply_deadline_at` and overwrites `reply_status`.

---

## 7. The scraper modules

### 7.1 `src/agoda/support-email/support-email.types.ts` — verbatim

```ts
/**
 * Shared types for the Agoda Partner Support email scraper.
 */

/** Sender Agoda replies always come from; anything else is ignored. */
export const AGODA_PARTNER_SUPPORT_ADDRESS = "partnersupport@agoda.com";

/** How far back to search Gmail when the caller does not specify a window. */
export const DEFAULT_LOOKBACK_DAYS = 10;

/**
 * Gmail label holding the Agoda correspondence, both directions. Scoping the
 * search to it keeps unrelated mail that happens to mention the Agoda ID out of
 * the candidate set. Override with `AGODA_SUPPORT_EMAIL_LABEL`.
 */
export const DEFAULT_SUPPORT_EMAIL_LABEL = "agoda-responses";

export interface SupportEmailHeaders {
  from: string;
  to: string | null;
  subject: string | null;
  date: string | null;
}

export type AttachmentFormat = "csv" | "xlsx" | "unknown";

/** Which of the two Agoda report layouts an attachment turned out to be. */
export type SheetType =
  /** Type 1 — has `Payment Status`, amount lives in `LP(USD)`. */
  | "payment_status"
  /** Type 2 — has `Booking Matched Status Name`, amount in `USD Total Include GST`. */
  | "booking_matched_status"
  | "unknown";

export type RowAction =
  /** Amount is known and above the minimum; the property can charge it. */
  | "COLLECT"
  /** Amount cannot be determined, so the case has to go back to Agoda. */
  | "REOPEN"
  /** Nothing to do for this row. */
  | "SKIP";

export interface EvaluatedRow {
  bookingId: string;
  action: RowAction;
  /** Parsed USD amount; null when the column is absent or unreadable. */
  amount: number | null;
  reason: string;
  checkoutDate: string | null;
  row: Record<string, string>;
}

export interface ReopenRuleOptions {
  /** Injectable clock, used by tests. */
  now?: Date;
}

export interface ReopenDecision {
  sheetType: SheetType;
  /** True when at least one row came back as REOPEN. */
  shouldReopen: boolean;
  /** Rows the property can charge directly. */
  collect: EvaluatedRow[];
  /** Rows that need the case reopened with Agoda. */
  reopen: EvaluatedRow[];
  /** Rows that need no action, each with the reason it was dropped. */
  skipped: EvaluatedRow[];
  /** Which column each rule input was read from, for troubleshooting. */
  detectedColumns: Record<string, string | null>;
}

export interface ParsedAttachment {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  format: AttachmentFormat;
  /** Column names in the order they appear in the file. */
  columns: string[];
  rows: Record<string, string>[];
  rowCount: number;
  /** Set when the file was downloaded but could not be parsed. */
  parseError?: string;
  /** Verdict from the reopen rules; absent for attachments that were skipped. */
  reopenDecision?: ReopenDecision;
  /** Where the original file was archived; null when the upload failed. */
  s3Url?: string | null;
  s3Key?: string | null;
  /** Why the archive upload failed, when it did. */
  uploadError?: string;
}

export interface ParsedSupportEmailBody {
  caseId: string | null;
  propertyId: string | null;
  propertyName: string | null;
  city: string | null;
  country: string | null;
  /** Reservation numbers Agoda listed as still having a pending balance. */
  reservationIds: string[];
  /** The accommodation partner email Agoda echoes back at the end of the reply. */
  partnerEmail: string | null;
  /** Plain-text rendering of the message, useful for debugging a failed parse. */
  text: string;
}

/** Roll-up of the per-attachment decisions for a single email. */
export interface ReopenSummary {
  shouldReopen: boolean;
  reason: string;
  /** Bookings needing the case reopened, deduplicated across attachments. */
  reopenBookingIds: string[];
  /** Bookings the property can charge directly, deduplicated. */
  collectBookingIds: string[];
}

/** Which way a message in the labelled conversation was travelling. */
export type SupportEmailDirection = "incoming" | "outgoing";

export interface SupportEmail {
  messageId: string;
  threadId: string | null;
  /** Derived from Gmail's `SENT` label rather than the sender address. */
  direction: SupportEmailDirection;
  /** Gmail internalDate as an ISO string. */
  receivedAt: string | null;
  headers: SupportEmailHeaders;
  body: ParsedSupportEmailBody;
  attachments: ParsedAttachment[];
  /** Combined reopen verdict across every attachment on this email. */
  reopen: ReopenSummary;
}

/** What persisting the parsed email did, or why it was not attempted. */
export interface SupportEmailStorage {
  /** True when this run was the one that wrote the record. */
  stored: boolean;
  /** True when the message was already captured by an earlier run. */
  duplicate: boolean;
  recordId: string | null;
  /**
   * The rest of the labelled conversation — our own submissions and any older
   * replies — captured alongside the message the rules ran against.
   */
  conversationStored: number;
  conversationDuplicates: number;
}

export type SupportEmailOutcome =
  /** Latest matching message was from Agoda Partner Support and was parsed. */
  | { status: "parsed"; email: SupportEmail; storage: SupportEmailStorage }
  /** Messages matched the Agoda ID but the newest one came from someone else. */
  | { status: "not_from_partner_support"; from: string; receivedAt: string | null }
  /** No message mentioning the Agoda ID within the lookback window. */
  | { status: "no_email_found" };

export interface ScrapeSupportEmailOptions {
  /**
   * Only consider messages received after this moment, instead of the rolling
   * day window. Callers pass the job's `updatedAt` so a run sees just what has
   * arrived since the job was last touched. Takes precedence over
   * `lookbackDays`.
   */
  since?: Date;
  /** Lookback window in days, used when `since` is not given. */
  lookbackDays?: number;
  /** How many Gmail search hits to consider when picking the newest message. */
  maxCandidates?: number;
  /** Skip downloading and parsing CSV/XLSX attachments. */
  includeAttachments?: boolean;
  /** Overrides for the reopen thresholds. */
  reopenRules?: ReopenRuleOptions;
  /** Recorded on the stored email as the run that first captured it. */
  jobId?: string;
  propertyId?: string;
  /** Skip writing the email to the database. Defaults to storing it. */
  persist?: boolean;
}

/** Per-job result for the bulk endpoint. */
export interface JobSupportEmailResult {
  jobId: string;
  agodaId: string;
  outcome: SupportEmailOutcome;
}

export interface BulkSupportEmailResults {
  processed: JobSupportEmailResult[];
  invalid: Array<{ jobId: string; reason: string; currentStatus?: string }>;
  errors: Array<{ jobId: string; error: string }>;
}
```

### 7.2 `src/agoda/support-email/email-body-parser.ts` — verbatim

```ts
/**
 * Parses the body of an Agoda Partner Support reply into structured fields.
 *
 * A typical reply looks like:
 *
 *   Case Id: 92752810
 *   PropertyID: 98433
 *   Property Name: The Westin Westminster
 *   City: Westminster (CO)
 *   Country: United States
 *   ...
 *   608820319
 *   590948995
 *   919720506
 *   ...
 *   This email belongs to the following accommodation partner Email: accounting@example.com
 */

import type { gmail_v1 } from "googleapis";
import type { ParsedSupportEmailBody } from "./support-email.types.js";

/** Reservation numbers Agoda lists are always plain 8-12 digit runs. */
const RESERVATION_ID_PATTERN = /^\d{8,12}$/;

/** Tags that imply a line break once markup is stripped. */
const BLOCK_TAG_PATTERN =
  /<\s*\/?\s*(?:br|p|div|tr|td|th|li|ul|ol|table|h[1-6])[^>]*>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (_match, name: string) => {
      return NAMED_ENTITIES[name.toLowerCase()] ?? _match;
    })
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCharCode(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCharCode(parseInt(code, 16))
    );
}

/**
 * Strips markup while preserving the line structure the field parsers rely on.
 */
export function htmlToText(html: string): string {
  const withoutMarkup = html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(BLOCK_TAG_PATTERN, "\n")
    .replace(/<[^>]+>/g, "");

  return normalizeText(decodeEntities(withoutMarkup));
}

function normalizeText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodePart(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

interface CollectedBody {
  plain: string;
  html: string;
}

/**
 * Walks the MIME tree collecting every text/plain and text/html leaf.
 */
export function collectBodyParts(
  payload: gmail_v1.Schema$MessagePart | undefined,
  collected: CollectedBody = { plain: "", html: "" }
): CollectedBody {
  if (!payload) return collected;

  const mimeType = payload.mimeType ?? "";
  const data = payload.body?.data;

  // A part with a filename is an attachment, not body content.
  if (data && !payload.filename) {
    if (mimeType === "text/plain") {
      collected.plain += `${decodePart(data)}\n`;
    } else if (mimeType === "text/html") {
      collected.html += `${decodePart(data)}\n`;
    }
  }

  for (const part of payload.parts ?? []) {
    collectBodyParts(part, collected);
  }

  return collected;
}

/**
 * Prefers the text/plain alternative, falling back to de-tagged HTML.
 */
export function getEmailText(
  payload: gmail_v1.Schema$MessagePart | undefined
): string {
  const { plain, html } = collectBodyParts(payload);
  const plainText = normalizeText(plain);
  if (plainText) return plainText;
  return html ? htmlToText(html) : "";
}

function matchGroup(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  const value = match?.[1]?.trim();
  return value ? value : null;
}

/**
 * Pulls the reservation numbers Agoda lists as still owing a balance.
 *
 * They appear as bare numbers, one per line or space separated, so a line only
 * counts when every token on it is a reservation number. That keeps labelled
 * values such as `Case Id: 92752810` out of the result.
 */
function extractReservationIds(text: string, exclude: Set<string>): string[] {
  const ids = new Set<string>();

  for (const line of text.split("\n")) {
    const tokens = line.trim().split(/[\s,;|]+/).filter(Boolean);
    if (tokens.length === 0) continue;
    if (!tokens.every((token) => RESERVATION_ID_PATTERN.test(token))) continue;

    for (const token of tokens) {
      if (!exclude.has(token)) ids.add(token);
    }
  }

  return [...ids];
}

export function parseSupportEmailBody(
  payload: gmail_v1.Schema$MessagePart | undefined
): ParsedSupportEmailBody {
  const text = getEmailText(payload);

  const caseId = matchGroup(text, /case\s*id\s*[:#-]?\s*(\d+)/i);
  const propertyId = matchGroup(text, /property\s*id\s*[:#-]?\s*(\d+)/i);

  const exclude = new Set<string>();
  if (caseId) exclude.add(caseId);
  if (propertyId) exclude.add(propertyId);

  return {
    caseId,
    propertyId,
    propertyName: matchGroup(text, /^\s*property\s*name\s*[:#-]?\s*(.+)$/im),
    city: matchGroup(text, /^\s*city\s*[:#-]?\s*(.+)$/im),
    country: matchGroup(text, /^\s*country\s*[:#-]?\s*(.+)$/im),
    reservationIds: extractReservationIds(text, exclude),
    partnerEmail: matchGroup(
      text,
      /accommodation\s+partner\s+email\s*[:#-]?\s*([^\s<>]+@[^\s<>]+)/i
    ),
    text,
  };
}

/**
 * Turns `Agoda <PartnerSupport@agoda.com>` into `partnersupport@agoda.com`.
 */
export function normalizeSenderAddress(fromHeader: string): string {
  const angled = /<([^>]+)>/.exec(fromHeader);
  const raw = angled?.[1] ?? fromHeader;
  return raw.trim().toLowerCase();
}

export function findHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string | null {
  const header = headers?.find(
    (candidate) => candidate.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? null;
}
```

### 7.3 `src/agoda/support-email/reopen-rules.ts` — verbatim

This is the most fiddly file. Every tolerance in it exists because a real Agoda
export broke without it — see §11.

```ts
/**
 * Decides, row by row, what to do with the report Agoda Partner Support
 * attached to its reply. Every row lands on one of three actions:
 *
 *   COLLECT — the amount is known and above the minimum, so the property can
 *             charge it directly.
 *   REOPEN  — the row is still owed but the amount cannot be determined, so the
 *             case has to go back to Agoda.
 *   SKIP    — nothing to do.
 *
 * Agoda sends two report layouts:
 *
 *   Type 1 `payment_status`         — has `Payment Status`; amount in `LP(USD)`.
 *   Type 2 `booking_matched_status` — has `Booking Matched Status Name`; amount
 *                                     in `USD Total Include GST`.
 *
 * The 150-day checkout cutoff is applied to both layouts before anything else.
 *
 * Header spelling, status casing and date formats all vary between exports, so
 * columns and status values are matched on a normalized form and dates are read
 * through a set of tolerant patterns rather than one fixed layout.
 */

import type {
  EvaluatedRow,
  ParsedAttachment,
  ReopenDecision,
  ReopenRuleOptions,
  RowAction,
  SheetType,
} from "./support-email.types.js";

// ============================================================
// Config
// ============================================================

/** Agoda stops accepting collection this long after checkout. */
export const CHECKOUT_DAYS_LIMIT = 150;

/** Below this amount it is not worth collecting. */
export const MIN_AMOUNT = 2;

/**
 * Column names in normalized form: lowercased with every separator removed.
 * `Check Out Date`, `Checkout Date`, `checkout_date` and `Check-out Date` all
 * collapse to `checkoutdate`, so one entry covers every spelling.
 */
const COLUMN_KEYS = {
  hotelId: ["hotelid", "propertyid", "hotelno"],
  bookingId: ["bookingid", "bookingno", "bookingnumber", "reservationid"],
  checkoutDate: [
    "checkoutdate",
    "checkout",
    "checkoutdt",
    "departuredate",
    "departure",
  ],
  paymentStatus: ["paymentstatus"],
  bookingStatus: ["bookingstatus"],
  matchedStatus: [
    "bookingmatchedstatusname",
    "bookingmatchedstatus",
    "matchedstatusname",
    "matchedstatus",
  ],
  /** Type 1 amount column: `LP(USD)` / `LP (USD)`. */
  type1Amount: ["lpusd", "lpusdamount"],
  /** Type 2 amount column: `USD Total Include GST`. */
  type2Amount: ["usdtotalincludegst", "usdtotalincludinggst", "usdtotal"],
} as const;

/** Matched statuses meaning the money has not been received yet. */
const UNPAID_MATCHED_STATUSES = ["open", "matchedunder", "matchunder"];

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// ============================================================
// Helpers
// ============================================================

/** Drops spaces, underscores, dashes and brackets so spellings can be compared. */
function normKey(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Lowercased, trimmed value — used for display in reasons. */
function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Normalized status value, so `Cxl by Customer` and `cxl_by_customer` agree. */
function normStatus(value: unknown): string {
  return normKey(value);
}

/** Resolves the real header name for a logical column, or null if absent. */
function findColumn(
  headers: string[],
  keys: readonly string[]
): string | null {
  return headers.find((header) => keys.includes(normKey(header))) ?? null;
}

function cell(row: Record<string, string>, column: string | null): string {
  if (!column) return "";
  return (row[column] ?? "").trim();
}

/**
 * Excel applies the cell's number format to IDs, so a hotel or booking number
 * arrives as `6,377,849.00`. Strip the separators and the decimal tail so the
 * value is usable and comparable, leaving anything non-numeric untouched.
 */
export function cleanId(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!/^[\d.,\s]+$/.test(text)) return text;
  return text.replace(/[,\s]/g, "").replace(/\.0+$/, "");
}

/** Reads `$1,234.56`, `USD 12.5`, `(12.50)` and plain numbers. */
export function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  let text = String(value).trim();
  if (!text) return null;

  // Accounting notation: (12.50) means -12.50.
  const isNegative = /^\(.*\)$/.test(text);
  if (isNegative) text = text.slice(1, -1);

  text = text.replace(/[^0-9.-]/g, "");
  if (!text || text === "-" || text === ".") return null;

  const num = Number(text);
  if (!Number.isFinite(num)) return null;

  return isNegative ? -num : num;
}

/** Excel serial: days since 1899-12-30. */
function fromExcelSerial(serial: number): Date | null {
  if (serial <= 0) return null;
  const date = new Date(Math.round((serial - 25569) * 86400000));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Two-digit years: 00-69 are 2000s, 70-99 are 1900s. */
function expandYear(year: number): number {
  if (year >= 100) return year;
  return year < 70 ? 2000 + year : 1900 + year;
}

function monthFromName(name: string): number | null {
  return MONTHS[name.slice(0, 3).toLowerCase()] ?? null;
}

/**
 * Reads the date formats Agoda's exports use in practice:
 * `2026-04-26`, `2026-04-23T08:53:16`, `4/26/2026`, `4/26/26`, `26.04.2026`,
 * `April 21, 2026`, `21 Apr 2026`, Date objects and Excel serials.
 */
export function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return fromExcelSerial(value);
  }

  const text = String(value).trim();
  if (!text) return null;

  // A serial that arrived as text, constrained to a plausible date range.
  if (/^\d{4,5}$/.test(text)) {
    const serial = Number(text);
    if (serial >= 20000 && serial <= 60000) return fromExcelSerial(serial);
  }

  let year: number;
  let month: number;
  let day: number;
  let match: RegExpExecArray | null;

  if ((match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/.exec(text))) {
    // ISO, tolerating a trailing time such as `2026-04-23T08:53:16`.
    year = +match[1];
    month = +match[2];
    day = +match[3];
  } else if ((match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?!\d)/.exec(text))) {
    // US month-first, with a two- or four-digit year.
    month = +match[1];
    day = +match[2];
    year = expandYear(+match[3]);

    // A first component above 12 can only be a day, so this is a day-first
    // export such as `26.04.2026`.
    if (month > 12 && day <= 12) {
      [month, day] = [day, month];
    }
  } else if ((match = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(text))) {
    // `April 21, 2026`
    const named = monthFromName(match[1]);
    if (named === null) return null;
    month = named;
    day = +match[2];
    year = +match[3];
  } else if ((match = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/.exec(text))) {
    // `21 April 2026`
    const named = monthFromName(match[2]);
    if (named === null) return null;
    day = +match[1];
    month = named;
    year = +match[3];
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects rolled-over values such as 2026-02-31.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  return date;
}

function daysAgo(date: Date, now: Date): number {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const then = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  return Math.floor((today - then) / 86400000);
}

interface RowVerdict {
  action: RowAction;
  amount: number | null;
  reason: string;
}

/**
 * Last step for both layouts once the status checks have passed: a readable
 * amount above the minimum is collectable, a blank one sends the case back.
 */
function finalizeAmount(rawAmount: unknown, reason: string): RowVerdict {
  const amount = parseAmount(rawAmount);

  if (amount === null) {
    return {
      action: "REOPEN",
      amount: null,
      reason: `${reason} (amount blank/unreadable)`,
    };
  }

  if (amount < MIN_AMOUNT) {
    return { action: "SKIP", amount, reason: `Amount ${amount} < ${MIN_AMOUNT}` };
  }

  return { action: "COLLECT", amount, reason };
}

// ============================================================
// Column resolution
// ============================================================

interface ResolvedColumns {
  hotelId: string | null;
  bookingId: string | null;
  checkoutDate: string | null;
  paymentStatus: string | null;
  bookingStatus: string | null;
  matchedStatus: string | null;
  amount: string | null;
}

export function resolveColumns(headers: string[]): ResolvedColumns {
  const matchedStatus = findColumn(headers, COLUMN_KEYS.matchedStatus);

  return {
    hotelId: findColumn(headers, COLUMN_KEYS.hotelId),
    bookingId: findColumn(headers, COLUMN_KEYS.bookingId),
    checkoutDate: findColumn(headers, COLUMN_KEYS.checkoutDate),
    paymentStatus: findColumn(headers, COLUMN_KEYS.paymentStatus),
    bookingStatus: findColumn(headers, COLUMN_KEYS.bookingStatus),
    matchedStatus,
    // Type 2 sheets carry the GST total; Type 1 sheets carry LP (USD).
    amount: matchedStatus
      ? findColumn(headers, COLUMN_KEYS.type2Amount)
      : findColumn(headers, COLUMN_KEYS.type1Amount),
  };
}

function detectSheetType(columns: ResolvedColumns): SheetType {
  if (columns.matchedStatus) return "booking_matched_status";
  if (columns.paymentStatus) return "payment_status";
  return "unknown";
}

// ============================================================
// Row decision
// ============================================================

export function decideAction(
  headers: string[],
  row: Record<string, string>,
  now: Date = new Date(),
  resolved?: ResolvedColumns
): RowVerdict {
  const columns = resolved ?? resolveColumns(headers);

  // ---------- 0. Drop anything past the 150-day checkout limit ----------
  // Applies to both layouts, so it runs before the type is even resolved.
  const checkoutDate = parseDate(cell(row, columns.checkoutDate));

  if (checkoutDate) {
    const age = daysAgo(checkoutDate, now);
    if (age > CHECKOUT_DAYS_LIMIT) {
      return {
        action: "SKIP",
        amount: null,
        reason: `Checkout ${age} days ago (limit ${CHECKOUT_DAYS_LIMIT})`,
      };
    }
  }
  // No checkout date, or unreadable — carry on with the normal flow.

  // ---------- Type 2: Agoda Matched Status report ----------
  // Matched / Matched-over → already paid → skip.
  // Open / Matched-under   → still owed:
  //     no amount column   → reopen
  //     amount column      → collect when >= MIN_AMOUNT, else skip
  if (columns.matchedStatus) {
    const raw = cell(row, columns.matchedStatus);

    if (!UNPAID_MATCHED_STATUSES.includes(normStatus(raw))) {
      return {
        action: "SKIP",
        amount: null,
        reason: `Matched status: ${norm(raw)}`,
      };
    }

    if (!columns.amount) {
      return {
        action: "REOPEN",
        amount: null,
        reason: "USD Total Include GST column missing",
      };
    }

    return finalizeAmount(cell(row, columns.amount), `Matched status: ${norm(raw)}`);
  }

  // ---------- Type 1: Payment Status report ----------
  // Paid → skip.
  // With a Booking Status column → needs Pending Collection + Departed.
  // Without one                  → Pending Collection alone is enough.
  // Then: no LP(USD) → reopen; otherwise collect when >= MIN_AMOUNT.
  if (columns.paymentStatus) {
    const rawPayment = cell(row, columns.paymentStatus);
    const paymentStatus = normStatus(rawPayment);

    if (paymentStatus === "paid") {
      return { action: "SKIP", amount: null, reason: "Already paid" };
    }

    if (columns.bookingStatus) {
      const rawBooking = cell(row, columns.bookingStatus);

      // Cxl by customer, or any other booking status, is not collectable.
      if (
        paymentStatus !== "pendingcollection" ||
        normStatus(rawBooking) !== "departed"
      ) {
        return {
          action: "SKIP",
          amount: null,
          reason: `${norm(rawPayment)} / ${norm(rawBooking)}`,
        };
      }
    } else if (paymentStatus !== "pendingcollection") {
      return {
        action: "SKIP",
        amount: null,
        reason: `Payment status: ${norm(rawPayment)}`,
      };
    }

    if (!columns.amount) {
      return { action: "REOPEN", amount: null, reason: "LP(USD) column missing" };
    }

    return finalizeAmount(
      cell(row, columns.amount),
      columns.bookingStatus
        ? "Pending collection + Departed"
        : "Pending collection (no booking status column)"
    );
  }

  return { action: "SKIP", amount: null, reason: "Unknown sheet type" };
}

// ============================================================
// Whole-attachment decision
// ============================================================

export function evaluateReopenDecision(
  attachment: ParsedAttachment,
  context: { agodaId?: string | null } = {},
  options: ReopenRuleOptions = {}
): ReopenDecision {
  const now = options.now ?? new Date();

  const headers =
    attachment.columns.length > 0
      ? attachment.columns
      : Object.keys(attachment.rows[0] ?? {});

  const columns = resolveColumns(headers);

  const decision: ReopenDecision = {
    sheetType: detectSheetType(columns),
    shouldReopen: false,
    collect: [],
    reopen: [],
    skipped: [],
    detectedColumns: { ...columns },
  };

  if (attachment.parseError || attachment.rows.length === 0) {
    return decision;
  }

  for (const row of attachment.rows) {
    const bookingId = cleanId(cell(row, columns.bookingId));
    const checkoutDate = cell(row, columns.checkoutDate) || null;
    const hotelId = cleanId(cell(row, columns.hotelId));

    const verdict =
      context.agodaId && hotelId && !sameId(hotelId, context.agodaId)
        ? {
            action: "SKIP" as RowAction,
            amount: null,
            reason: `Row hotel ID ${hotelId} does not match property Agoda ID ${context.agodaId}`,
          }
        : decideAction(headers, row, now, columns);

    const evaluated: EvaluatedRow = {
      bookingId,
      action: verdict.action,
      amount: verdict.amount,
      reason: verdict.reason,
      checkoutDate,
      row,
    };

    if (verdict.action === "COLLECT") decision.collect.push(evaluated);
    else if (verdict.action === "REOPEN") decision.reopen.push(evaluated);
    else decision.skipped.push(evaluated);
  }

  decision.shouldReopen = decision.reopen.length > 0;

  return decision;
}

function sameId(left: string, right: string): boolean {
  const a = cleanId(left);
  const b = cleanId(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const numericA = Number(a);
  const numericB = Number(b);
  return (
    Number.isFinite(numericA) && Number.isFinite(numericB) && numericA === numericB
  );
}
```

### 7.4 `src/agoda/support-email/attachment-storage.ts` — verbatim

```ts
/**
 * Archives the original CSV / XLSX files Agoda Partner Support attaches to its
 * replies, so the raw report stays available after parsing.
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { dualLogInfo, dualLogWarn } from "../../common/log-helper.js";
import type { AttachmentFormat } from "./support-email.types.js";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const bucketName = process.env.S3_BUCKET_NAME || "vnpstorage";

export interface AttachmentUploadResult {
  s3Url: string | null;
  s3Key: string | null;
  uploadError?: string;
}

export interface AttachmentUploadInput {
  agodaId: string | null | undefined;
  messageId: string;
  filename: string;
  mimeType: string;
  format: AttachmentFormat;
  buffer: Buffer;
}

/** Keeps the key readable while staying inside S3's safe character set. */
function sanitizeFilename(filename: string): string {
  const cleaned = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return cleaned || "attachment";
}

function contentTypeFor(mimeType: string, format: AttachmentFormat): string {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  if (format === "csv") return "text/csv";
  if (format === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "application/octet-stream";
}

/**
 * The key is derived only from the Gmail message and the filename, so a message
 * seen again in a later run overwrites its own object instead of piling up
 * copies, and the URL already on record stays valid.
 */
export function buildAttachmentS3Key(
  agodaId: string | null | undefined,
  messageId: string,
  filename: string
): string {
  return `support-email-attachments/${agodaId || "unknown"}/${messageId}/${sanitizeFilename(filename)}`;
}

/**
 * Uploads one attachment. Never throws: losing the archive copy must not fail
 * the scrape, so the reason is returned for the caller to record instead.
 */
export async function uploadAttachmentToS3(
  input: AttachmentUploadInput
): Promise<AttachmentUploadResult> {
  const s3Key = buildAttachmentS3Key(
    input.agodaId,
    input.messageId,
    input.filename
  );

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: input.buffer,
        ContentType: contentTypeFor(input.mimeType, input.format),
        Metadata: {
          messageId: input.messageId,
          agodaId: input.agodaId || "unknown",
          uploadedAt: new Date().toISOString(),
        },
      })
    );

    const s3Url = `https://${bucketName}.s3.${
      process.env.AWS_REGION || "us-east-1"
    }.amazonaws.com/${s3Key}`;

    await dualLogInfo(`☁️ Uploaded attachment ${input.filename} to S3`, {
      messageId: input.messageId,
      agodaId: input.agodaId,
      s3Key,
    });

    return { s3Url, s3Key };
  } catch (error: any) {
    const uploadError = error?.message || String(error);
    await dualLogWarn(
      `⚠️ Failed to upload attachment ${input.filename} to S3`,
      { messageId: input.messageId, s3Key, error: uploadError }
    );
    return { s3Url: null, s3Key, uploadError };
  }
}
```

### 7.5 `src/agoda/support-email/attachment-parser.ts` — verbatim

```ts
/**
 * Downloads and parses the CSV / XLSX files Agoda Partner Support attaches to
 * its replies (for example `69836fdc661b7989c3cec535.csv`).
 */

import type { gmail_v1 } from "googleapis";
import Papa from "papaparse";
import XLSX from "xlsx";
import { dualLogInfo, dualLogWarn } from "../../common/log-helper.js";
import { uploadAttachmentToS3 } from "./attachment-storage.js";
import { evaluateReopenDecision } from "./reopen-rules.js";
import type {
  AttachmentFormat,
  ParsedAttachment,
  ReopenRuleOptions,
} from "./support-email.types.js";

export interface AttachmentContext {
  /** Agoda property ID, used to reject rows belonging to another hotel. */
  agodaId?: string | null;
  reopenRules?: ReopenRuleOptions;
  /** Archive the original file to S3. Defaults to true. */
  uploadToS3?: boolean;
}

interface AttachmentRef {
  filename: string;
  mimeType: string;
  attachmentId: string;
  sizeBytes: number;
}

function detectFormat(filename: string, mimeType: string): AttachmentFormat {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "csv") return "csv";
  if (extension === "xlsx" || extension === "xls") return "xlsx";

  const type = mimeType.toLowerCase();
  if (type.includes("csv")) return "csv";
  if (type.includes("spreadsheet") || type.includes("excel")) return "xlsx";
  return "unknown";
}

/**
 * Walks the MIME tree collecting every downloadable attachment reference.
 */
export function collectAttachmentRefs(
  payload: gmail_v1.Schema$MessagePart | undefined,
  refs: AttachmentRef[] = []
): AttachmentRef[] {
  if (!payload) return refs;

  const filename = payload.filename ?? "";
  const attachmentId = payload.body?.attachmentId;

  if (filename && attachmentId) {
    refs.push({
      filename,
      mimeType: payload.mimeType ?? "application/octet-stream",
      attachmentId,
      sizeBytes: payload.body?.size ?? 0,
    });
  }

  for (const part of payload.parts ?? []) {
    collectAttachmentRefs(part, refs);
  }

  return refs;
}

function toStringRecord(row: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key.trim()] = value == null ? "" : String(value).trim();
  }
  return normalized;
}

function parseCsv(buffer: Buffer): {
  columns: string[];
  rows: Record<string, string>[];
} {
  // Strip a UTF-8 BOM so the first column name does not gain a stray prefix.
  const content = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const result = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  return {
    columns: (result.meta.fields ?? []).map((field) => field.trim()),
    rows: result.data.map(toStringRecord),
  };
}

function parseXlsx(buffer: Buffer): {
  columns: string[];
  rows: Record<string, string>[];
} {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { columns: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false })
    .map(toStringRecord);

  const columns = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    range: 0,
  })[0];

  return {
    columns: (columns ?? []).map((column) => String(column).trim()),
    rows,
  };
}

export function parseAttachmentBuffer(
  filename: string,
  mimeType: string,
  buffer: Buffer
): ParsedAttachment {
  const format = detectFormat(filename, mimeType);
  const base = {
    filename,
    mimeType,
    sizeBytes: buffer.length,
    format,
  };

  if (format === "unknown") {
    return {
      ...base,
      columns: [],
      rows: [],
      rowCount: 0,
      parseError: `Unsupported attachment type: ${filename}`,
    };
  }

  try {
    const { columns, rows } = format === "csv" ? parseCsv(buffer) : parseXlsx(buffer);
    return { ...base, columns, rows, rowCount: rows.length };
  } catch (error: any) {
    return {
      ...base,
      columns: [],
      rows: [],
      rowCount: 0,
      parseError: error?.message || String(error),
    };
  }
}

/**
 * Downloads every CSV / XLSX attachment on a message and parses it into rows.
 * Attachments of other types are reported with a `parseError` rather than
 * dropped, so the caller can still see what came through.
 */
export async function downloadAndParseAttachments(
  gmail: gmail_v1.Gmail,
  messageId: string,
  payload: gmail_v1.Schema$MessagePart | undefined,
  context: AttachmentContext = {}
): Promise<ParsedAttachment[]> {
  const refs = collectAttachmentRefs(payload);
  if (refs.length === 0) return [];

  await dualLogInfo(
    `📎 Found ${refs.length} attachment(s) on message ${messageId}`
  );

  const parsed: ParsedAttachment[] = [];

  for (const ref of refs) {
    if (detectFormat(ref.filename, ref.mimeType) === "unknown") {
      await dualLogInfo(`⏭️ Skipping non-tabular attachment: ${ref.filename}`);
      parsed.push({
        filename: ref.filename,
        mimeType: ref.mimeType,
        sizeBytes: ref.sizeBytes,
        format: "unknown",
        columns: [],
        rows: [],
        rowCount: 0,
        parseError: "Unsupported attachment type",
      });
      continue;
    }

    try {
      const response = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: ref.attachmentId,
      });

      const data = response.data.data;
      if (!data) {
        throw new Error("Gmail returned an empty attachment body");
      }

      const buffer = Buffer.from(data, "base64url");
      const attachment = parseAttachmentBuffer(
        ref.filename,
        ref.mimeType,
        buffer
      );

      if (context.uploadToS3 !== false) {
        const upload = await uploadAttachmentToS3({
          agodaId: context.agodaId,
          messageId,
          filename: ref.filename,
          mimeType: ref.mimeType,
          format: attachment.format,
          buffer,
        });
        attachment.s3Url = upload.s3Url;
        attachment.s3Key = upload.s3Key;
        attachment.uploadError = upload.uploadError;
      }

      const decision = evaluateReopenDecision(
        attachment,
        { agodaId: context.agodaId },
        context.reopenRules
      );
      attachment.reopenDecision = decision;

      await dualLogInfo(
        `✅ Parsed attachment ${ref.filename} (${attachment.rowCount} rows)`,
        {
          sheetType: decision.sheetType,
          shouldReopen: decision.shouldReopen,
          collectCount: decision.collect.length,
          reopenCount: decision.reopen.length,
          skippedCount: decision.skipped.length,
          s3Url: attachment.s3Url,
        }
      );
      parsed.push(attachment);
    } catch (error: any) {
      await dualLogWarn(`⚠️ Failed to download attachment ${ref.filename}`, {
        error: error?.message || String(error),
      });
      parsed.push({
        filename: ref.filename,
        mimeType: ref.mimeType,
        sizeBytes: ref.sizeBytes,
        format: detectFormat(ref.filename, ref.mimeType),
        columns: [],
        rows: [],
        rowCount: 0,
        parseError: error?.message || String(error),
      });
    }
  }

  return parsed;
}
```

### 7.6 `src/agoda/support-email/support-email-scraper.ts` — verbatim

```ts
/**
 * Agoda Partner Support email scraper.
 *
 * For each job it resolves the property's Agoda ID, searches the Agoda label in
 * Gmail for messages mentioning that ID, takes the newest one sent by
 * `PartnerSupport@agoda.com`, and parses its body and any CSV / XLSX
 * attachment.
 *
 * The window is either a rolling number of days or everything since a caller
 * supplied cutoff — the reply-status flow passes the job's `updatedAt` so it
 * only sees what has arrived since the job was last touched.
 *
 * The captured email is persisted once per Gmail message; results are also
 * returned to the caller.
 */

import dotenv from "dotenv";
import { google, type gmail_v1 } from "googleapis";
import { loadAndSetCredentials } from "../../common/load-token.js";
import { dualLogError, dualLogInfo, dualLogWarn } from "../../common/log-helper.js";
import { oauth2Client } from "../../config/google-config.js";
import { JobStatus } from "../../models/job.model.js";
import { jobService } from "../../services/job.service.js";
import { supportEmailService } from "../../services/support-email.service.js";
import { downloadAndParseAttachments } from "./attachment-parser.js";
import {
  findHeader,
  normalizeSenderAddress,
  parseSupportEmailBody,
} from "./email-body-parser.js";
import {
  AGODA_PARTNER_SUPPORT_ADDRESS,
  DEFAULT_LOOKBACK_DAYS,
  DEFAULT_SUPPORT_EMAIL_LABEL,
  type BulkSupportEmailResults,
  type JobSupportEmailResult,
  type ParsedAttachment,
  type ReopenSummary,
  type ScrapeSupportEmailOptions,
  type SupportEmail,
  type SupportEmailDirection,
  type SupportEmailOutcome,
} from "./support-email.types.js";

dotenv.config();

const DEFAULT_MAX_CANDIDATES = 10;

const SUPPORT_EMAIL_LABEL =
  process.env.AGODA_SUPPORT_EMAIL_LABEL || DEFAULT_SUPPORT_EMAIL_LABEL;

async function getGmailClient(): Promise<gmail_v1.Gmail> {
  const tokenPath = process.env.TOKEN_PATH || "token.json";
  const loaded = await loadAndSetCredentials(tokenPath);

  if (!loaded) {
    throw new Error(
      "Failed to load Gmail credentials. Complete the Google OAuth setup at /auth first."
    );
  }

  return google.gmail({ version: "v1", auth: oauth2Client });
}

/**
 * Scoped to the Agoda label so the whole conversation is in range, replies and
 * sent mail included. Quoting the Agoda ID stops Gmail from tokenizing it into
 * unrelated numeric matches, and the label is quoted too so a renamed label
 * containing spaces still works.
 *
 * `after:` narrows the window server-side, but Gmail applies it at day
 * granularity, so the exact cutoff is enforced again on the results.
 */
function buildSearchQuery(
  agodaId: string,
  window: { since?: Date; lookbackDays: number }
): string {
  const scope = window.since
    ? `after:${Math.floor(window.since.getTime() / 1000)}`
    : `newer_than:${window.lookbackDays}d`;

  return `label:"${SUPPORT_EMAIL_LABEL}" "${agodaId}" ${scope}`;
}

function toIsoDate(internalDate: string | null | undefined): string | null {
  if (!internalDate) return null;
  const millis = Number(internalDate);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

interface CandidateMessage {
  id: string;
  millis: number;
  from: string;
  sender: string;
  receivedAt: string | null;
  direction: SupportEmailDirection;
}

/**
 * Loads just enough of each hit to order and attribute it, newest first. Gmail
 * lists newest first already, but ordering is re-derived from `internalDate` so
 * "the last mail" is right even if the listing order shifts.
 */
async function loadCandidates(
  gmail: gmail_v1.Gmail,
  messageIds: string[]
): Promise<CandidateMessage[]> {
  const candidates: CandidateMessage[] = [];

  for (const id of messageIds) {
    try {
      const meta = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["Date", "From"],
      });

      const from =
        findHeader(meta.data.payload?.headers ?? undefined, "From") ?? "";

      candidates.push({
        id,
        millis: Number(meta.data.internalDate ?? 0),
        from,
        sender: normalizeSenderAddress(from),
        receivedAt: toIsoDate(meta.data.internalDate),
        // Gmail's own SENT label is more reliable than matching the From
        // address against whichever alias the mailbox happens to send as.
        direction: (meta.data.labelIds ?? []).includes("SENT")
          ? "outgoing"
          : "incoming",
      });
    } catch (error) {
      await dualLogWarn(`⚠️ Could not read metadata for message ${id}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return candidates.sort((a, b) => b.millis - a.millis);
}

/** Rolls the per-attachment verdicts up into one answer for the email. */
function summarizeReopen(attachments: ParsedAttachment[]): ReopenSummary {
  const decisions = attachments
    .map((attachment) => attachment.reopenDecision)
    .filter((decision): decision is NonNullable<typeof decision> =>
      Boolean(decision)
    );

  if (decisions.length === 0) {
    return {
      shouldReopen: false,
      reason: "No tabular attachment to evaluate",
      reopenBookingIds: [],
      collectBookingIds: [],
    };
  }

  const dedupe = (ids: string[]) => [...new Set(ids.filter(Boolean))];

  const reopenBookingIds = dedupe(
    decisions.flatMap((decision) =>
      decision.reopen.map((entry) => entry.bookingId)
    )
  );
  const collectBookingIds = dedupe(
    decisions.flatMap((decision) =>
      decision.collect.map((entry) => entry.bookingId)
    )
  );

  const reasonParts: string[] = [];
  if (reopenBookingIds.length > 0) {
    reasonParts.push(`${reopenBookingIds.length} booking(s) need the case reopened`);
  }
  if (collectBookingIds.length > 0) {
    reasonParts.push(`${collectBookingIds.length} booking(s) can be collected`);
  }

  return {
    shouldReopen: decisions.some((decision) => decision.shouldReopen),
    reason: reasonParts.join(", ") || "Nothing outstanding in the report",
    reopenBookingIds,
    collectBookingIds,
  };
}

async function buildSupportEmail(
  gmail: gmail_v1.Gmail,
  message: gmail_v1.Schema$Message,
  agodaId: string,
  options: ScrapeSupportEmailOptions,
  includeAttachments: boolean,
  direction: SupportEmailDirection
): Promise<SupportEmail> {
  const payload = message.payload ?? undefined;
  const headers = payload?.headers ?? undefined;
  const messageId = message.id as string;

  const attachments = includeAttachments
    ? await downloadAndParseAttachments(gmail, messageId, payload, {
        agodaId,
        reopenRules: options.reopenRules,
        // A run that is not writing the record should not leave an orphaned
        // file behind either.
        uploadToS3: options.persist !== false,
      })
    : [];

  return {
    messageId,
    threadId: message.threadId ?? null,
    direction,
    receivedAt: toIsoDate(message.internalDate),
    headers: {
      from: findHeader(headers, "From") ?? "",
      to: findHeader(headers, "To"),
      subject: findHeader(headers, "Subject"),
      date: findHeader(headers, "Date"),
    },
    body: parseSupportEmailBody(payload),
    attachments,
    reopen: summarizeReopen(attachments),
  };
}

/**
 * Stores the rest of the labelled conversation — our own submissions and any
 * older replies — so the exchange is on record, not just the one message the
 * reopen rules ran against.
 *
 * Messages already captured by an earlier run are skipped before Gmail is asked
 * for the body, so a repeat scrape costs one cheap database lookup each.
 */
async function captureRemainingConversation(
  gmail: gmail_v1.Gmail,
  candidates: CandidateMessage[],
  primaryMessageId: string,
  agodaId: string,
  options: ScrapeSupportEmailOptions,
  includeAttachments: boolean
): Promise<{ stored: number; duplicates: number }> {
  let stored = 0;
  let duplicates = 0;

  for (const candidate of candidates) {
    if (candidate.id === primaryMessageId) continue;

    try {
      if (await supportEmailService.isStored(candidate.id)) {
        duplicates += 1;
        continue;
      }

      const message = await gmail.users.messages.get({
        userId: "me",
        id: candidate.id,
        format: "full",
      });

      const email = await buildSupportEmail(
        gmail,
        message.data,
        agodaId,
        options,
        includeAttachments,
        candidate.direction
      );

      const result = await supportEmailService.storeIfNew(email, {
        agodaId,
        jobId: options.jobId,
        propertyId: options.propertyId,
      });

      if (result.stored) stored += 1;
      else if (result.duplicate) duplicates += 1;
    } catch (error) {
      // One unreadable message must not cost us the rest of the conversation.
      await dualLogWarn(
        `⚠️ Could not capture conversation message ${candidate.id}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  return { stored, duplicates };
}

/**
 * Finds and parses the latest Agoda Partner Support reply for one Agoda ID.
 */
export async function scrapeAgodaSupportEmail(
  agodaId: string,
  options: ScrapeSupportEmailOptions = {}
): Promise<SupportEmailOutcome> {
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const includeAttachments = options.includeAttachments ?? true;
  const since = options.since;
  const windowLabel = since
    ? `since ${since.toISOString()}`
    : `in the last ${lookbackDays} days`;

  const gmail = await getGmailClient();
  const query = buildSearchQuery(agodaId, { since, lookbackDays });

  await dualLogInfo(`📧 Searching Gmail for Agoda ID ${agodaId}`, { query });

  const list = await gmail.users.messages.list({
    userId: "me",
    maxResults: maxCandidates,
    q: query,
  });

  const messageIds = (list.data.messages ?? [])
    .map((message) => message.id)
    .filter((id): id is string => Boolean(id));

  if (messageIds.length === 0) {
    await dualLogInfo(
      `📭 No emails mentioning Agoda ID ${agodaId} ${windowLabel}`
    );
    return { status: "no_email_found" };
  }

  await dualLogInfo(
    `📬 Found ${messageIds.length} candidate email(s) for Agoda ID ${agodaId}`
  );

  const loaded = await loadCandidates(gmail, messageIds);

  // Gmail resolves `after:` to whole days, so it can hand back mail from
  // earlier on the cutoff day. Re-apply the cutoff exactly.
  const candidates = since
    ? loaded.filter((candidate) => candidate.millis > since.getTime())
    : loaded;

  if (candidates.length === 0) {
    await dualLogInfo(
      `📭 Nothing new for Agoda ID ${agodaId} ${windowLabel}`,
      { discardedByCutoff: loaded.length }
    );
    return { status: "no_email_found" };
  }

  // The label covers both directions, so the newest hit is often our own reply.
  // Take the newest message Agoda actually sent rather than stopping at the
  // newest overall and calling it a day.
  const latestReply = candidates.find(
    (candidate) => candidate.sender === AGODA_PARTNER_SUPPORT_ADDRESS
  );

  if (!latestReply) {
    const newest = candidates[0];
    await dualLogInfo(
      `↩️ No Partner Support message among the ${candidates.length} hit(s) for Agoda ID ${agodaId}; newest is from ${newest.sender || "unknown"}`
    );
    return {
      status: "not_from_partner_support",
      from: newest.from,
      receivedAt: newest.receivedAt,
    };
  }

  const message = await gmail.users.messages.get({
    userId: "me",
    id: latestReply.id,
    format: "full",
  });

  await dualLogInfo(
    `✅ Latest Partner Support reply for Agoda ID ${agodaId} received ${latestReply.receivedAt}, parsing`
  );

  const email = await buildSupportEmail(
    gmail,
    message.data,
    agodaId,
    options,
    includeAttachments,
    latestReply.direction
  );

  await dualLogInfo(`📄 Parsed support email for Agoda ID ${agodaId}`, {
    caseId: email.body.caseId,
    reservationCount: email.body.reservationIds.length,
    attachmentCount: email.attachments.length,
    shouldReopen: email.reopen.shouldReopen,
    reopenBookings: email.reopen.reopenBookingIds.length,
    collectBookings: email.reopen.collectBookingIds.length,
  });

  if (options.persist === false) {
    return {
      status: "parsed",
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

  // Gmail keeps returning the same message for the whole window, so the store
  // is a no-op after the first sighting.
  const primaryStorage = await supportEmailService.storeIfNew(email, {
    agodaId,
    jobId: options.jobId,
    propertyId: options.propertyId,
  });

  const conversation = await captureRemainingConversation(
    gmail,
    candidates,
    latestReply.id,
    agodaId,
    options,
    includeAttachments
  );

  if (conversation.stored > 0) {
    await dualLogInfo(
      `🗂️ Captured ${conversation.stored} further message(s) from the Agoda ${agodaId} conversation`
    );
  }

  return {
    status: "parsed",
    email,
    storage: {
      ...primaryStorage,
      conversationStored: conversation.stored,
      conversationDuplicates: conversation.duplicates,
    },
  };
}

/**
 * Runs the scrape for a batch of job IDs, isolating per-job failures.
 *
 * Only jobs whose property run finished are worth looking at, and each is read
 * from its own `updatedAt` so a run reports what has arrived since the job was
 * last touched rather than re-reading mail an earlier run already saw.
 */
export async function scrapeSupportEmailsForJobs(
  jobIds: string[],
  options: ScrapeSupportEmailOptions = {}
): Promise<BulkSupportEmailResults> {
  const results: BulkSupportEmailResults = {
    processed: [],
    invalid: [],
    errors: [],
  };

  for (const jobId of jobIds) {
    try {
      const job = await jobService.getJobById(jobId);
      if (!job) {
        results.invalid.push({ jobId, reason: "Job not found" });
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

      const propertyData = await jobService.getAgodaIdFromJob(jobId);
      if (!propertyData?.agodaId) {
        results.invalid.push({
          jobId,
          reason: `Cannot retrieve a valid agoda_id for job ${jobId}. The property may not have agoda_id assigned or it is "0".`,
          currentStatus: job.job_status,
        });
        continue;
      }

      const outcome = await scrapeAgodaSupportEmail(propertyData.agodaId, {
        since: job.updatedAt,
        ...options,
        jobId,
        propertyId: job.property_id?.toString(),
      });

      const result: JobSupportEmailResult = {
        jobId,
        agodaId: propertyData.agodaId,
        outcome,
      };
      results.processed.push(result);
    } catch (error: any) {
      await dualLogError(
        `Error scraping Agoda support email for job ${jobId}:`,
        error
      );
      results.errors.push({
        jobId,
        error: error?.message || String(error),
      });
    }
  }

  return results;
}
```

> **`since` goes before the spread on purpose.** It acts as a default the caller
> can override; putting it after would make the per-job anchor impossible to
> change.

---

## 8. Shared infrastructure

### 8.1 `src/config/google-config.ts` — verbatim

```ts
import dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config();
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Function to generate auth URL with proper parameters for refresh token
function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // This ensures we get a refresh token
  });
}

export { getAuthUrl, oauth2Client, SCOPES };
```

### 8.2 `src/common/log-helper.ts` — minimal version

The original also fans out to a per-job log stream. Only the four exports below
are used by this feature; if the host project has its own logger, map onto it.

```ts
export async function dualLogInfo(message: string, metadata?: any): Promise<void> {
  console.log(message, metadata ? JSON.stringify(metadata) : "");
}

export async function dualLogWarn(message: string, metadata?: any): Promise<void> {
  console.warn(message, metadata ? JSON.stringify(metadata) : "");
}

export async function dualLogError(
  message: string,
  error?: any,
  metadata?: any
): Promise<void> {
  console.error(
    message,
    error instanceof Error ? error.message : error,
    metadata ? JSON.stringify(metadata) : ""
  );
}

export async function dualLogDebug(message: string, metadata?: any): Promise<void> {
  console.debug(message, metadata ? JSON.stringify(metadata) : "");
}
```

### 8.3 `src/common/s3-token.ts` — verbatim

Reads and writes the shared Google token object.

```ts
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import { dualLogError, dualLogWarn, dualLogInfo } from "./log-helper.js";

dotenv.config();

const AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET as string;
const S3_TOKEN_KEY = process.env.S3_TOKEN_KEY || "keyspace/token.json";

const s3Client = new S3Client({ region: AWS_REGION });

export const TOKEN_S3_DETAILS = { bucket: S3_BUCKET_NAME, key: S3_TOKEN_KEY };

export async function readTokenDataFromS3<T = any>(): Promise<T | null> {
  if (!S3_BUCKET_NAME) {
    await dualLogWarn("S3 bucket not configured; cannot read token from S3", {});
    return null;
  }
  try {
    const res = await s3Client.send(
      new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: S3_TOKEN_KEY })
    );
    if (!res.Body) return null;

    // Node.js SDK v3 provides transformToString on Body
    const text = await (res.Body as any).transformToString();
    return JSON.parse(text) as T;
  } catch (error) {
    await dualLogError("Failed to read token directly from S3", error, {
      bucket: S3_BUCKET_NAME,
      key: S3_TOKEN_KEY,
    });
    return null;
  }
}

export async function uploadTokenToS3FromData(tokenData: unknown): Promise<boolean> {
  if (!S3_BUCKET_NAME) {
    await dualLogWarn("S3 bucket not configured; skipping token upload to S3", {});
    return false;
  }
  try {
    const body = Buffer.from(JSON.stringify(tokenData, null, 2), "utf8");
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: S3_TOKEN_KEY,
        Body: body,
        ContentType: "application/json",
      })
    );
    await dualLogInfo("Uploaded token to S3", {
      bucket: S3_BUCKET_NAME,
      key: S3_TOKEN_KEY,
    });
    return true;
  } catch (error) {
    await dualLogError("Failed to upload token to S3", error, {
      bucket: S3_BUCKET_NAME,
      key: S3_TOKEN_KEY,
    });
    return false;
  }
}
```

### 8.4 `src/common/load-token.ts` — minimal version

Only `loadAndSetCredentials` is used by this feature. It reads the token from
S3, refreshes it if it is within five minutes of expiry, writes the refreshed
token back to S3, and sets the credentials on `oauth2Client`.

```ts
import dotenv from "dotenv";
import fs from "fs";
import { oauth2Client } from "../config/google-config.js";
import { dualLogError, dualLogInfo, dualLogWarn } from "./log-helper.js";
import { readTokenDataFromS3, uploadTokenToS3FromData } from "./s3-token.js";

dotenv.config();

export interface GoogleTokenData {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

async function loadTokenData(tokenPath: string): Promise<GoogleTokenData | null> {
  try {
    const tokenData = await readTokenDataFromS3<GoogleTokenData>();
    if (!tokenData) {
      await dualLogWarn("Google OAuth2 token not found in S3", {});
      return null;
    }

    // Keep a local copy for debugging; best effort.
    try {
      fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2));
    } catch {
      /* ignore */
    }

    if (!tokenData.access_token) {
      throw new Error("Invalid token data: missing access_token");
    }

    return tokenData;
  } catch (error) {
    await dualLogError("Error loading Google OAuth2 token:", error, { tokenPath });
    return null;
  }
}

async function refreshGoogleToken(tokenPath: string): Promise<boolean> {
  try {
    const tokenData = await loadTokenData(tokenPath);
    if (!tokenData?.refresh_token) {
      await dualLogError(
        "No refresh token available. Re-authenticate with offline access.",
        {}
      );
      return false;
    }

    oauth2Client.setCredentials(tokenData);
    const { credentials } = await oauth2Client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error("Failed to get new access token from Google");
    }

    const updated: GoogleTokenData = {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token || tokenData.refresh_token,
      scope: credentials.scope || tokenData.scope,
      token_type: credentials.token_type || tokenData.token_type || "Bearer",
      expiry_date: credentials.expiry_date || undefined,
    };

    try {
      fs.writeFileSync(tokenPath, JSON.stringify(updated, null, 2));
    } catch {
      /* ignore */
    }
    await uploadTokenToS3FromData(updated);

    oauth2Client.setCredentials(updated);
    await dualLogInfo("Google OAuth2 token refresh completed successfully");
    return true;
  } catch (error) {
    await dualLogError("Error refreshing Google OAuth2 token:", error);
    return false;
  }
}

/**
 * Loads the shared token, refreshing first when it is close to expiry, and
 * applies it to `oauth2Client`.
 */
export async function loadAndSetCredentials(
  tokenPath: string = process.env.TOKEN_PATH || "token.json"
): Promise<boolean> {
  try {
    const current = await loadTokenData(tokenPath);
    const bufferMs = 5 * 60 * 1000;

    if (current?.expiry_date && current.expiry_date - Date.now() <= bufferMs) {
      await refreshGoogleToken(tokenPath);
    }

    const tokenData = await loadTokenData(tokenPath);
    if (!tokenData) {
      throw new Error(
        "Google OAuth2 token not found in S3. Run the authentication setup first."
      );
    }
    if (!tokenData.refresh_token) {
      throw new Error(
        "No refresh token found. Re-authenticate with offline access."
      );
    }

    oauth2Client.setCredentials(tokenData);
    return true;
  } catch (error) {
    await dualLogError("Error loading and setting Google OAuth2 credentials:", error);
    return false;
  }
}
```

---

## 9. The route handler

```ts
import express from "express";
import { JobStatus, ReplyStatus } from "../models/job.model.js";
import { jobService } from "../services/job.service.js";
import { scrapeSupportEmailsForJobs } from "../agoda/support-email/support-email-scraper.js";

app.post("/api/agoda/support-email-run-job", (async (
  req: express.Request,
  res: express.Response
) => {
  try {
    const { job_ids } = req.body;

    if (!job_ids || !Array.isArray(job_ids) || job_ids.length === 0) {
      return res.status(400).json({
        status: 400,
        message: "job_ids array is required and must not be empty",
      });
    }

    // Capture and classify: fetch, deduplicate, store, and record how Agoda
    // answered on the job. Acting on that answer is somebody else's job.
    const results = await scrapeSupportEmailsForJobs(job_ids);

    const replyStatuses: Array<{ jobId: string; replyStatus: ReplyStatus }> = [];

    for (const result of results.processed) {
      // Anything other than a parsed Partner Support reply means Agoda has not
      // answered this run yet; reply_deadline_at is what says whether that is
      // now overdue.
      const replyStatus =
        result.outcome.status !== "parsed"
          ? ReplyStatus.NoReplied
          : result.outcome.email.reopen.shouldReopen &&
              result.outcome.email.reopen.reopenBookingIds.length > 0
            ? ReplyStatus.RepliedRed
            : ReplyStatus.RepliedGreen;

      await jobService.updateJobReplyStatus(result.jobId, replyStatus);
      replyStatuses.push({ jobId: result.jobId, replyStatus });
    }

    const parsed = results.processed.filter(
      (result) => result.outcome.status === "parsed"
    );
    const withoutReply = results.processed.length - parsed.length;
    const newlyStored = parsed.filter(
      (result) =>
        result.outcome.status === "parsed" && result.outcome.storage.stored
    ).length;
    const conversationStored = parsed.reduce(
      (sum, result) =>
        result.outcome.status === "parsed"
          ? sum + result.outcome.storage.conversationStored
          : sum,
      0
    );

    const red = replyStatuses.filter(
      (entry) => entry.replyStatus === ReplyStatus.RepliedRed
    ).length;
    const green = replyStatuses.filter(
      (entry) => entry.replyStatus === ReplyStatus.RepliedGreen
    ).length;

    return res.status(200).json({
      status: 200,
      message: `Processed ${job_ids.length} jobs. ${parsed.length} support email(s) captured (${newlyStored} newly stored, ${parsed.length - newlyStored} already on record), ${conversationStored} further conversation message(s) captured, ${green} RepliedGreen, ${red} RepliedRed, ${withoutReply} without a Partner Support reply, ${results.invalid.length} invalid, ${results.errors.length} with errors.`,
      results: { ...results, replyStatuses },
    });
  } catch (err: any) {
    console.error("Error in /api/agoda/support-email-run-job:", err);
    res.status(500).json({
      status: 500,
      message: "Error scraping Agoda support emails",
      error: err.message,
    });
  }
}) as any);
```

---

## 10. Request and response

### Request

```json
{ "job_ids": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"] }
```

### Response (200)

```json
{
  "status": 200,
  "message": "Processed 2 jobs. 1 support email(s) captured (1 newly stored, 0 already on record), 2 further conversation message(s) captured, 1 RepliedGreen, 0 RepliedRed, 1 without a Partner Support reply, 0 invalid, 0 with errors.",
  "results": {
    "processed": [
      {
        "jobId": "507f1f77bcf86cd799439011",
        "agodaId": "2462187",
        "outcome": {
          "status": "parsed",
          "email": {
            "messageId": "1936ab2c4d5e6f70",
            "threadId": "1936ab2c4d5e6f70",
            "direction": "incoming",
            "receivedAt": "2026-09-01T04:12:33.000Z",
            "headers": {
              "from": "Agoda <PartnerSupport@agoda.com>",
              "to": "accounting@example.com",
              "subject": "RE: Case 92752810 - Outstanding balance",
              "date": "Tue, 1 Sep 2026 04:12:33 +0000"
            },
            "body": {
              "caseId": "92752810",
              "propertyId": "2462187",
              "propertyName": "The Westin Westminster",
              "city": "Westminster (CO)",
              "country": "United States",
              "reservationIds": ["608820319", "590948995"],
              "partnerEmail": "accounting@example.com",
              "text": "Case Id: 92752810\nPropertyID: 2462187\n..."
            },
            "attachments": [
              {
                "filename": "69836fdc661b7989c3cec535.csv",
                "mimeType": "text/csv",
                "sizeBytes": 4821,
                "format": "csv",
                "columns": ["Hotel ID", "Booking ID", "Checkout Date", "Booking Matched Status Name", "USD Total Include GST"],
                "rowCount": 12,
                "s3Url": "https://vnpstorage.s3.us-east-1.amazonaws.com/support-email-attachments/2462187/1936ab2c4d5e6f70/69836fdc661b7989c3cec535.csv",
                "s3Key": "support-email-attachments/2462187/1936ab2c4d5e6f70/69836fdc661b7989c3cec535.csv",
                "reopenDecision": {
                  "sheetType": "booking_matched_status",
                  "shouldReopen": false,
                  "collect": [],
                  "reopen": [],
                  "skipped": [],
                  "detectedColumns": {}
                }
              }
            ],
            "reopen": {
              "shouldReopen": false,
              "reason": "3 booking(s) can be collected",
              "reopenBookingIds": [],
              "collectBookingIds": ["608820319", "590948995", "919720506"]
            }
          },
          "storage": {
            "stored": true,
            "duplicate": false,
            "recordId": "66f1a2b3c4d5e6f7a8b9c0d4",
            "conversationStored": 2,
            "conversationDuplicates": 0
          }
        }
      }
    ],
    "invalid": [
      {
        "jobId": "507f1f77bcf86cd799439012",
        "reason": "Job 507f1f77bcf86cd799439012 is Failed; only Completed jobs have a case to look up.",
        "currentStatus": "Failed"
      }
    ],
    "errors": [],
    "replyStatuses": [
      { "jobId": "507f1f77bcf86cd799439011", "replyStatus": "RepliedGreen" }
    ]
  }
}
```

`outcome.status` is one of `parsed`, `not_from_partner_support` or
`no_email_found`. Only `parsed` carries `email` and `storage`.

---

## 11. Gotchas

Each of these exists because a real export or mailbox broke without it.

1. **The Gmail label must exist and be applied.** The search is scoped to
   `label:"agoda-responses"`. No label, no results, no matter what is in the
   mailbox. It must cover both directions of the conversation.

2. **Gmail's `after:` is day-granular even with a Unix timestamp.** It can
   return mail from earlier on the cutoff day, so the exact cutoff is applied
   again in `scrapeAgodaSupportEmail` against `internalDate`. Do not drop that
   filter as redundant.

3. **The newest labelled message is often our own.** Since the label covers both
   directions, the code deliberately picks the newest message *from Partner
   Support* rather than the newest overall. Taking the newest hit would report
   `not_from_partner_support` every time we had just sent something.

4. **`updatedAt` moves whenever anything writes to the job.** That is the point
   — it advances the watermark so a handled reply is not read twice — but it
   also means a job touched for an unrelated reason narrows its own window.

5. **Excel number-formats IDs.** A booking ID arrives as `6,377,849.00`. Always
   compare through `cleanId`.

6. **Two-digit years are real.** `4/26/26` appears in live exports. `parseDate`
   pivots at 70: 00–69 are 2000s, 70–99 are 1900s.

7. **Column names vary.** `Check Out Date`, `Checkout`, `checkout_date` and
   `Departure Date` all mean the same thing. Matching is on `normKey`, which
   strips everything non-alphanumeric and lowercases — never compare raw
   headers.

8. **`message_id` is uniquely indexed.** Concurrent runs will race; the service
   catches Mongo error `11000` and reports a duplicate rather than throwing.

9. **Attachments are archived, rows are not stored.** `support_emails` keeps
   only column names and a row count. The untouched original lives in S3, so
   the record cannot drift from what Agoda actually sent.

10. **S3 keys are deterministic.** Re-scraping a message overwrites its own
    object rather than accumulating copies, so URLs already on record stay
    valid.

11. **`agoda_id` is a string on `properties`,** and `"0"` means unset.

12. **The reopen rules run but nothing acts on them.** They exist here only to
    decide red versus green. If you find yourself queueing work from this
    endpoint, that belongs elsewhere.
