/**
 * Use-case layer behind `POST /api/agoda/send-to-retrieval`.
 *
 * For each Completed Agoda job, reads the newest stored Partner Support
 * reply (captured by `POST /api/agoda/retrive-case-email`) and, when it
 * leaves nothing to reopen, hands its collectable booking IDs to the
 * retrieval side. One `ParentRetrieval` is written per call, with one
 * `Retrieval` underneath it per property.
 *
 * This never talks to Gmail — without a stored reply the job is skipped,
 * not treated as "nothing to collect".
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Job, JobStatus, OTAProvider } from '@prisma/client';
import { IAgodaCaseItemService } from '../agoda-case-item/agoda-case-item.interface';
import { DatabaseService } from '../database/database.service';
import { resolveAgodaIdForJob } from '../job/agoda-id.util';
import { IJobRepository } from '../job/job.interface';
import { REPLY_DEADLINE_HOURS } from '../job/reply-status.util';
import { IPropertyRepository } from '../property/property.interface';
import { CreateRetrievalDto } from '../retrieval/retrieval.dto';
import { IRetrievalService } from '../retrieval/retrieval.interface';
import { ISupportEmailRepository } from '../support-email/support-email.interface';
import {
  CollectRetrievalResult,
  ISendToRetrievalService,
  RunSendToRetrievalResult,
  SendToRetrievalError,
  SendToRetrievalInvalid,
  SendToRetrievalSkipped,
} from './send-to-retrieval.interface';

const EXECUTION_TYPE = 'retrieval';
const BACKOFF_LENGTH_LOADING = 5000;
const BACKOFF_LENGTH_SELECTOR = 3000;

interface CollectCandidate {
  job: Job;
  agodaId: string;
  reservations: string[];
}

function defaultParentName(now: Date): string {
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
  return `Agoda Collect ${stamp} UTC`;
}

@Injectable()
export class SendToRetrievalService implements ISendToRetrievalService {
  private readonly logger = new Logger(SendToRetrievalService.name);

  constructor(
    @Inject('IJobRepository')
    private readonly jobRepository: IJobRepository,
    @Inject('IPropertyRepository')
    private readonly propertyRepository: IPropertyRepository,
    @Inject('ISupportEmailRepository')
    private readonly supportEmailRepository: ISupportEmailRepository,
    @Inject('IRetrievalService')
    private readonly retrievalService: IRetrievalService,
    @Inject('IAgodaCaseItemService')
    private readonly agodaCaseItemService: IAgodaCaseItemService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * `job.updatedAt` cannot be the freshness cutoff: capturing the email
   * writes `reply_status` back onto the job, which bumps `updatedAt` past
   * the email's own `received_at`. `reply_deadline_at` minus the 48h grace
   * period gives back the run's actual completion time instead, and that is
   * never moved by those writes.
   *
   * Jobs completed before `reply_deadline_at` existed have no cutoff and
   * fall back to their newest stored reply — permissive on purpose, since
   * skipping them outright would be worse.
   */
  private runCompletedAt(job: Job): Date | null {
    if (!job.reply_deadline_at) return null;
    return new Date(
      job.reply_deadline_at.getTime() - REPLY_DEADLINE_HOURS * 60 * 60 * 1000,
    );
  }

  private async createRetrievalForCandidate(
    candidate: CollectCandidate,
    parentRetrievalId: string,
  ) {
    const { job, reservations } = candidate;

    const data: CreateRetrievalDto = {
      name: job.property_name,
      job_status: JobStatus.Pending,

      portfolio_id: job.portfolio_id ?? undefined,
      sub_portfolio_id: job.sub_portfolio_id ?? undefined,
      property_id: job.property_id ?? undefined,
      user_id: job.user_id,
      parent_retrieval_id: parentRetrievalId,

      posting_type: job.posting_type,
      portfolio_name: job.portfolio_name ?? undefined,
      sub_portfolio_name: job.sub_portfolio_name ?? undefined,
      property_name: job.property_name,
      ota_provider: OTAProvider.Agoda,

      // The retrieval run works these out for itself; seed zeros here too
      // rather than guessing from the report.
      remaining_direct_billed: 0,
      total_collectable: 0,
      total_amount_confirmed: 0,
      execution_type: EXECUTION_TYPE,

      job_backoff_length_loading: BACKOFF_LENGTH_LOADING,
      job_backoff_length_selector: BACKOFF_LENGTH_SELECTOR,

      reservations,
      case_open: false,
    };

    // Create the retrieval first
    const retrieval = await this.retrievalService.createRetrieval(data);

    // Create AgodaCaseItems for each reservation
    await this.createAgodaCaseItemsForRetrieval(job, reservations, retrieval.id);

    return retrieval;
  }

  /**
   * Creates AgodaCaseItem records for each reservation in the retrieval.
   * Fetches JobItem data for each reservation and maps it to AgodaCaseItem fields.
   */
  private async createAgodaCaseItemsForRetrieval(
    job: Job,
    reservationIds: string[],
    retrievalId: string,
  ): Promise<void> {
    try {
      // Fetch JobItems for these reservations
      const jobItems = await this.db.jobItem.findMany({
        where: {
          job_id: job.id,
          reservation_id: {
            in: reservationIds,
          },
        },
      });

      // Create AgodaCaseItem for each JobItem
      for (const jobItem of jobItems) {
        try {
          await this.agodaCaseItemService.create({
            property_id: job.property_id ?? undefined,
            batch_id: job.batch_id ?? undefined,
            portfolio_id: job.portfolio_id ?? undefined,
            retrieval_id: retrievalId,
            reservation_id: jobItem.reservation_id ?? undefined,
            // guest_name, check_in, check_out, amount, amount_to_charge are
            // deliberately left unset here — the retrieval process fills
            // these in itself once it runs.
            currency: undefined, // Not available in JobItem
            charge_status: 'retrieval_required',
            vcc_card_number: undefined, // Will be filled by retrieval process
            card_expire: undefined, // Will be filled by retrieval process
            card_cvv: undefined, // Will be filled by retrieval process
            is_missing: true,
            retrival_status: 'Pending',
            createdBy: job.user_id,
          });

          this.logger.log(
            `✅ Created AgodaCaseItem for reservation ${jobItem.reservation_id} (retrievalId=${retrievalId})`,
          );
        } catch (error: any) {
          this.logger.error(
            `Failed to create AgodaCaseItem for reservation ${jobItem.reservation_id}:`,
            error,
          );
          // Continue with other items even if one fails
        }
      }

      // Log warning if some reservations don't have JobItems
      if (jobItems.length < reservationIds.length) {
        const foundIds = new Set(jobItems.map((item) => item.reservation_id));
        const missingIds = reservationIds.filter((id) => !foundIds.has(id));
        this.logger.warn(
          `⚠️ ${missingIds.length} reservation(s) not found in JobItems: ${missingIds.join(', ')}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error creating AgodaCaseItems for retrieval ${retrievalId}:`,
        error,
      );
      // Don't throw - let the retrieval be created even if case items fail
    }
  }

  /**
   * Writes one parent retrieval and a retrieval per property beneath it. A
   * property whose insert fails is reported and skipped rather than taking
   * the batch down with it.
   */
  private async createCollectRetrievals(
    candidates: CollectCandidate[],
  ): Promise<CollectRetrievalResult> {
    const result: CollectRetrievalResult = {
      parentRetrievalId: null,
      parentRetrievalName: null,
      created: [],
      failed: [],
    };

    if (candidates.length === 0) return result;

    const parentName = defaultParentName(new Date());
    const parent = await this.retrievalService.createParentRetrieval({
      name: parentName,
      ota_provider: OTAProvider.Agoda,
    });

    result.parentRetrievalId = parent.id;
    result.parentRetrievalName = parentName;

    this.logger.log(
      `📦 Created parent retrieval "${parentName}" (id=${parent.id}, properties=${candidates.length})`,
    );

    for (const candidate of candidates) {
      const jobId = candidate.job.id;

      try {
        const retrieval = await this.createRetrievalForCandidate(
          candidate,
          parent.id,
        );

        result.created.push({
          jobId,
          agodaId: candidate.agodaId,
          retrievalId: retrieval.id,
          reservationCount: candidate.reservations.length,
        });

        this.logger.log(
          `🧾 Created retrieval for Agoda ID ${candidate.agodaId} with ${candidate.reservations.length} reservation(s) ` +
            `(jobId=${jobId}, retrievalId=${retrieval.id}, parentRetrievalId=${parent.id})`,
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to create retrieval for job ${jobId}:`,
          error,
        );
        result.failed.push({
          jobId,
          error: error?.message || String(error),
        });
      }
    }

    return result;
  }

  async runJob(jobIds: string[]): Promise<RunSendToRetrievalResult> {
    const skipped: SendToRetrievalSkipped[] = [];
    const invalid: SendToRetrievalInvalid[] = [];
    const errors: SendToRetrievalError[] = [];

    // Gathered across the loop so the whole call shares one parent retrieval.
    const collectCandidates: CollectCandidate[] = [];

    for (const jobId of jobIds) {
      try {
        const job = await this.jobRepository.findById(jobId);
        if (!job) {
          invalid.push({ jobId, reason: 'Job not found' });
          continue;
        }

        if (job.job_status !== JobStatus.Completed) {
          invalid.push({
            jobId,
            reason: `Job ${jobId} is ${job.job_status}; only Completed jobs can be sent to retrieval.`,
            currentStatus: job.job_status,
          });
          continue;
        }

        const agodaId = await resolveAgodaIdForJob(
          job,
          this.propertyRepository,
        );
        if (!agodaId) {
          invalid.push({
            jobId,
            reason: `Cannot retrieve a valid agoda_id for job ${jobId}. The property may not have agoda_id assigned or it is "0".`,
            currentStatus: job.job_status,
          });
          continue;
        }

        const since = this.runCompletedAt(job);

        const email =
          await this.supportEmailRepository.findLatestPartnerSupportReply(
            agodaId,
            { since },
          );

        if (!email) {
          skipped.push({
            jobId,
            agodaId,
            reason: since
              ? `No stored Agoda reply that arrived after the run finished (${since.toISOString()}). Capture it with POST /api/agoda/retrive-case-email first.`
              : 'No stored Agoda reply for this property. Capture it with POST /api/agoda/retrive-case-email first.',
          });
          continue;
        }

        // The case has to be settled with Agoda before the balance can be
        // treated as collectable, so anything still needing a reopen waits.
        if (email.should_reopen && email.reopen_booking_ids.length > 0) {
          skipped.push({
            jobId,
            agodaId,
            reason: `${email.reopen_booking_ids.length} booking(s) still need the case reopened`,
          });
          continue;
        }

        if (email.collect_booking_ids.length === 0) {
          skipped.push({
            jobId,
            agodaId,
            reason: 'No collectable booking in the stored reply',
          });
          continue;
        }

        collectCandidates.push({
          job,
          agodaId,
          reservations: email.collect_booking_ids,
        });
      } catch (error: any) {
        this.logger.error(`Error preparing retrieval for job ${jobId}:`, error);
        errors.push({ jobId, error: error?.message || String(error) });
      }
    }

    const retrieval = await this.createCollectRetrievals(collectCandidates);

    const bookingsSent = retrieval.created.reduce(
      (sum, entry) => sum + entry.reservationCount,
      0,
    );

    const message =
      `Processed ${jobIds.length} jobs. ${retrieval.created.length} retrieval(s) created covering ${bookingsSent} booking(s), ` +
      `${skipped.length} skipped, ${invalid.length} invalid, ${errors.length} with errors.`;

    return {
      message,
      results: { skipped, invalid, errors, retrieval },
    };
  }
}
