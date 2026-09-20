import { Logger } from '@nestjs/common';
import { Response } from 'express';
import {
  ReportExportType,
  enqueueReportExport,
  getReportsExportQueueUrl,
} from './reports-sqs.util';

/**
 * Shared "should this export go async?" gate — originally lived only in
 * `reports.controller.ts`, now shared by every producer that feeds the
 * reports-export SQS queue:
 *   - `POST /reports/export-master` / `export-consolidated` / `export-dashboard`
 *   - `POST /jobs/card-activity-wide-export`
 *   - `POST /scraper/api/jobs/items/export-with-verdicts`
 *
 * The async path is taken when ALL of the following hold:
 *   1. The request has more than `jobThreshold` job_ids, OR more than
 *      `itemThreshold` total job items.
 *   2. `REPORTS_EXPORT_QUEUE_URL` is configured.
 *   3. The JWT carries an email we can deliver the link to.
 *
 * If (1) but not (2)/(3), we log a warning and fall back to sync so dev
 * environments (no queue) still work — the user might just hit nginx's
 * `proxy_read_timeout` on huge exports, but the request never silently
 * disappears.
 */

/** Job-count threshold above which an export request goes async. */
export const ASYNC_EXPORT_JOB_THRESHOLD = 10;

/**
 * Total job-item rows above which sync export usually exceeds browser /
 * proxy timeouts (nginx ALB default ~60s). Routes to SQS + email link
 * even when job count <= ASYNC_EXPORT_JOB_THRESHOLD.
 */
export const ASYNC_EXPORT_ITEM_THRESHOLD = 500;

/** Defense-in-depth against the SQS 256 KB per-message hard limit. */
const SQS_MAX_BODY_BYTES = 240 * 1024; // 240 KB — 16 KB headroom under 256 KB

export interface AsyncExportDecision {
  useAsync: boolean;
  reason: 'job_count' | 'item_count' | null;
  jobIdsCount: number;
  itemCount: number;
}

export async function shouldUseAsyncExport(
  jobIds: string[],
  countJobItemsByJobIds: (jobIds: string[]) => Promise<number>,
  jobThreshold: number = ASYNC_EXPORT_JOB_THRESHOLD,
  itemThreshold: number = ASYNC_EXPORT_ITEM_THRESHOLD,
): Promise<AsyncExportDecision> {
  const uniqueJobIds = Array.from(new Set(jobIds ?? [])).filter(Boolean);
  const jobIdsCount = uniqueJobIds.length;
  if (jobIdsCount === 0) {
    return { useAsync: false, reason: null, jobIdsCount: 0, itemCount: 0 };
  }

  const itemCount = await countJobItemsByJobIds(uniqueJobIds);

  if (jobIdsCount > jobThreshold) {
    return { useAsync: true, reason: 'job_count', jobIdsCount, itemCount };
  }
  if (itemCount > itemThreshold) {
    return { useAsync: true, reason: 'item_count', jobIdsCount, itemCount };
  }

  return { useAsync: false, reason: null, jobIdsCount, itemCount };
}

export interface TryEnqueueAsyncJobExportOptions {
  /** The raw Express request — `request.user` must carry `userId` + `email`. */
  request: any;
  response: Response;
  jobIds: string[];
  exportType: ReportExportType;
  /** Usually `IJobRepository.countJobItemsByJobIds` bound to the caller's repo instance. */
  countJobItemsByJobIds: (jobIds: string[]) => Promise<number>;
  logger: Logger;
  jobThreshold?: number;
  itemThreshold?: number;
}

/**
 * Runs the async gate and, if the export should go async, fully writes
 * the HTTP response itself (202 queued / 400 too-large / 500 enqueue
 * failure) and returns `true` — the caller MUST return immediately
 * without doing anything else. Returns `false` when the caller should
 * fall through to its existing synchronous path.
 */
export async function tryEnqueueAsyncJobExport(
  opts: TryEnqueueAsyncJobExportOptions,
): Promise<boolean> {
  const {
    request,
    response,
    jobIds,
    exportType,
    countJobItemsByJobIds,
    logger,
    jobThreshold = ASYNC_EXPORT_JOB_THRESHOLD,
    itemThreshold = ASYNC_EXPORT_ITEM_THRESHOLD,
  } = opts;

  const asyncDecision = await shouldUseAsyncExport(
    jobIds,
    countJobItemsByJobIds,
    jobThreshold,
    itemThreshold,
  );
  if (!asyncDecision.useAsync) return false;

  const { jobIdsCount, itemCount, reason } = asyncDecision;

  const queueUrl = getReportsExportQueueUrl();
  if (!queueUrl) {
    logger.warn(
      `Async export requested (${jobIdsCount} jobs, ${itemCount} items, ` +
        `reason=${reason}, type=${exportType}) but REPORTS_EXPORT_QUEUE_URL ` +
        `is not configured — falling back to the synchronous path.`,
    );
    return false;
  }

  const user = request.user;
  if (!user?.email) {
    logger.warn(
      `Async export requested but JWT carries no email — falling back to ` +
        `the synchronous path (user=${user?.userId ?? 'unknown'}).`,
    );
    return false;
  }

  // Build the payload once so we can both measure it and send it.
  // De-dupe + drop falsy IDs to mirror what the consumer would have
  // processed anyway, and shrink the body a bit.
  const payload = {
    exportType,
    jobIds: Array.from(new Set(jobIds ?? [])).filter(Boolean),
    user: {
      userId: user.userId,
      email: user.email,
      name: user.name ?? null,
    },
    requestedAt: new Date().toISOString(),
  };

  const payloadBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (payloadBytes > SQS_MAX_BODY_BYTES) {
    logger.warn(
      `Refusing to enqueue ${exportType} export — payload ` +
        `${payloadBytes} B exceeds ${SQS_MAX_BODY_BYTES} B SQS body cap ` +
        `(user=${user.email}, jobs=${payload.jobIds.length}).`,
    );
    response.status(400).json({
      statusCode: 400,
      message:
        `Export request is too large to queue. Please narrow your ` +
        `filters (current payload: ${Math.round(payloadBytes / 1024)} KB, ` +
        `max: ${Math.round(SQS_MAX_BODY_BYTES / 1024)} KB).`,
      data: null,
    });
    return true;
  }

  try {
    await enqueueReportExport(payload, logger);
    logger.log(
      `[export-${exportType}] Queued async export — ${jobIdsCount} job(s), ` +
        `${itemCount} item(s), reason=${reason}, email=${user.email}`,
    );
  } catch (err) {
    logger.error(
      `Failed to enqueue ${exportType} export: ${err?.message ?? err}`,
      err?.stack,
    );
    response.status(500).json({
      statusCode: 500,
      message:
        'Failed to queue the export for background processing. Please try again.',
      data: null,
    });
    return true;
  }

  response.status(202).json({
    statusCode: 202,
    message:
      `Your export is being prepared. We will email a download link to ` +
      `${user.email} when it's ready.`,
    data: {
      queued: true,
      exportType,
      email: user.email,
      jobIdsCount,
      itemCount,
      asyncReason: reason,
    },
  });
  return true;
}
