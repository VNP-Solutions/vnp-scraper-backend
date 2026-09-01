import { OTAProvider, ReplyStatus } from '@prisma/client';

/** Grace period Agoda gets to reply before a job counts as unanswered. */
export const REPLY_DEADLINE_HOURS = 48;

/**
 * Fields that restart the Agoda Partner Support reply wait. A finished run is
 * the point from which a reply can be expected, so completing an Agoda job
 * resets it to `NoReplied` and starts a fresh 48h deadline — a rerun
 * therefore does not inherit the previous run's verdict.
 *
 * Only Agoda jobs have a Partner Support email thread to wait on —
 * Expedia/Booking jobs never look at `reply_status`, so nothing is written
 * for them.
 *
 * Call this from every code path that sets `job_status` to `Completed`
 * (see `JobService.updateJob` and `ScraperJobItemService.persistRows`).
 */
export function buildReplyWaitFields(
  otaProvider: OTAProvider | string | null | undefined,
): Partial<{ reply_status: ReplyStatus; reply_deadline_at: Date }> {
  if (otaProvider !== OTAProvider.Agoda) return {};

  return {
    reply_status: ReplyStatus.NoReplied,
    reply_deadline_at: new Date(
      Date.now() + REPLY_DEADLINE_HOURS * 60 * 60 * 1000,
    ),
  };
}
