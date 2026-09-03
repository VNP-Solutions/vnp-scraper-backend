import { OTAProvider, ReplyStatus } from '@prisma/client';

/** Grace period Agoda gets to reply before a job counts as unanswered. */
export const REPLY_DEADLINE_HOURS = 48;

/**
 * Formats a date as "mm/dd/yyyy" for `Job.job_completed_date`. Plain
 * zero-padded string, not locale-aware — same format regardless of server
 * locale.
 */
export function formatJobCompletedDate(date: Date = new Date()): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/** Parses a `job_completed_date` string ("mm/dd/yyyy") back to a Date (local midnight). Returns null if malformed/absent. */
export function parseJobCompletedDate(
  value: string | null | undefined,
): Date | null {
  if (!value) return null;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Fields written whenever a job completes:
 * - `job_completed_date` — the completion date as "mm/dd/yyyy", for every
 *   OTA. Kept separate from `updatedAt` because `updatedAt` keeps moving
 *   forward on later, unrelated edits (e.g. a manual reply_status
 *   correction), which would otherwise silently shift the cutoff used to
 *   look up the Agoda support-email reply.
 * - `reply_status` / `reply_deadline_at` — Agoda only. A finished run is the
 *   point from which a reply can be expected, so completing an Agoda job
 *   resets it to `NoReplied` and starts a fresh 48h deadline — a rerun
 *   therefore does not inherit the previous run's verdict. Expedia/Booking
 *   jobs never look at `reply_status`, so nothing is written for them.
 *
 * Call this from every code path that sets `job_status` to `Completed`
 * (see `JobService.updateJob` and `ScraperJobItemService.persistRows`).
 */
export function buildReplyWaitFields(
  otaProvider: OTAProvider | string | null | undefined,
): Partial<{
  reply_status: ReplyStatus;
  reply_deadline_at: Date;
  job_completed_date: string;
}> {
  const job_completed_date = formatJobCompletedDate();

  if (otaProvider !== OTAProvider.Agoda) return { job_completed_date };

  return {
    reply_status: ReplyStatus.NoReplied,
    reply_deadline_at: new Date(
      Date.now() + REPLY_DEADLINE_HOURS * 60 * 60 * 1000,
    ),
    job_completed_date,
  };
}

/**
 * Classifies one already-parsed Partner Support reply as `RepliedRed` (at
 * least one booking still needs the case reopened) or `RepliedGreen`
 * (nothing outstanding). There is no `NoReplied` case here — that only
 * applies at the job level when no reply was found at all; a
 * `ParsedSupportEmail` by definition means a message was found.
 *
 * Shared by `SupportEmailService` (writes the job's `reply_status`) and
 * `SupportEmailScraperService` (writes the same verdict onto the stored
 * `SupportEmail` row itself, so it survives the job's own `reply_status`
 * being reset on a later run).
 */
export function deriveEmailReplyStatus(reopen: {
  shouldReopen: boolean;
  reopenBookingIds: string[];
}): ReplyStatus {
  return reopen.shouldReopen && reopen.reopenBookingIds.length > 0
    ? ReplyStatus.RepliedRed
    : ReplyStatus.RepliedGreen;
}
