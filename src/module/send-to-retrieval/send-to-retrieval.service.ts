/**
 * Use-case layer behind `POST /api/agoda/send-to-retrieval`.
 *
 * For each Completed Agoda job, reads the newest stored Partner Support
 * reply (captured by `POST /api/agoda/retrive-case-email`) and, when it
 * leaves nothing to reopen, hands its collectable booking IDs to the
 * retrieval side. One `ParentRetrieval` is written per call, with one
 * `Retrieval` underneath it per property. Each job that gets a retrieval
 * has its `reply_status` set to `SendToRetrieval`, taking it out of the
 * reply-wait cycle the support-email cron polls.
 *
 * This never talks to Gmail — without a stored reply the job is skipped,
 * not treated as "nothing to collect".
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CollectBookingAmount,
  Job,
  JobStatus,
  OTAProvider,
  ReplyStatus,
} from '@prisma/client';
import { IAgodaCaseItemService } from '../agoda-case-item/agoda-case-item.interface';
import { DatabaseService } from '../database/database.service';
import { resolveAgodaIdForJob } from '../job/agoda-id.util';
import { IJobRepository } from '../job/job.interface';
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
  /** Amount/currency Agoda's report showed per booking, from the stored reply. */
  bookingAmounts: CollectBookingAmount[];
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

  private async createRetrievalForCandidate(
    candidate: CollectCandidate,
    parentRetrievalId: string,
  ) {
    const { job, reservations, bookingAmounts } = candidate;

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

    // Create (or update) AgodaCaseItems for each reservation
    await this.createAgodaCaseItemsForRetrieval(
      job,
      reservations,
      retrieval.id,
      bookingAmounts,
    );

    return retrieval;
  }

  /**
   * Creates one AgodaCaseItem per reservation in the retrieval, or updates
   * the existing one for the same (reservation_id, property_id) pair —
   * resending a job to retrieval must not pile up duplicate rows for a
   * booking it already has a case item for.
   */
  private async createAgodaCaseItemsForRetrieval(
    job: Job,
    reservationIds: string[],
    retrievalId: string,
    bookingAmounts: CollectBookingAmount[],
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

      const amountByBookingId = new Map<
        string,
        { amount: string | null; currency: string | null }
      >();
      for (const entry of bookingAmounts) {
        if (!entry.booking_id) continue;
        amountByBookingId.set(entry.booking_id, {
          amount: entry.amount,
          currency: entry.currency,
        });
      }

      // Create or update AgodaCaseItem for each JobItem
      for (const jobItem of jobItems) {
        const reservationId = jobItem.reservation_id ?? undefined;
        const amountInfo = reservationId
          ? amountByBookingId.get(reservationId)
          : undefined;

        try {
          const payload = {
            property_id: job.property_id ?? undefined,
            batch_id: job.batch_id ?? undefined,
            portfolio_id: job.portfolio_id ?? undefined,
            retrieval_id: retrievalId,
            reservation_id: reservationId,
            // Straight from the report Agoda attached to its reply
            // (captured by POST /api/agoda/retrive-case-email); guest_name,
            // check_in, check_out and amount stay unset here — the
            // retrieval process fills those in once it runs.
            amount_to_charge: amountInfo?.amount ?? undefined,
            currency: amountInfo?.currency ?? undefined,
            charge_status: 'retrieval_required',
            vcc_card_number: undefined, // Will be filled by retrieval process
            card_expire: undefined, // Will be filled by retrieval process
            card_cvv: undefined, // Will be filled by retrieval process
            is_missing: true,
            retrival_status: 'Pending',
            ota_provider: OTAProvider.Agoda,
            posting_type: job.posting_type,
            createdBy: job.user_id,
          };

          const existing =
            job.property_id && reservationId
              ? await this.agodaCaseItemService.findByReservationAndProperty(
                  reservationId,
                  job.property_id,
                )
              : null;

          if (existing) {
            await this.agodaCaseItemService.update(existing.id, payload);
            this.logger.log(
              `♻️ Updated existing AgodaCaseItem for reservation ${reservationId} ` +
                `(id=${existing.id}, retrievalId=${retrievalId}) instead of duplicating it`,
            );
          } else {
            await this.agodaCaseItemService.create(payload);
            this.logger.log(
              `✅ Created AgodaCaseItem for reservation ${reservationId} (retrievalId=${retrievalId})`,
            );
          }
        } catch (error: any) {
          this.logger.error(
            `Failed to create/update AgodaCaseItem for reservation ${reservationId}:`,
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

        // Balance is now handed off to retrieval — move the job out of the
        // reply-wait cycle so the support-email cron stops polling Gmail
        // for it and it no longer reads as NoReplied/overdue. Best-effort:
        // the retrieval itself already succeeded, so a failure here is
        // logged rather than reported as a failed retrieval.
        try {
          await this.jobRepository.updateReplyStatus(
            jobId,
            ReplyStatus.SendToRetrieval,
          );
        } catch (error: any) {
          this.logger.error(
            `Retrieval ${retrieval.id} created but failed to set reply_status=SendToRetrieval on job ${jobId}:`,
            error,
          );
        }
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

        // Just take whatever the latest stored Partner Support reply is for
        // this Agoda ID — same lookup GET /jobs/:id/support-email uses. No
        // freshness cutoff: if a reply is stored, use it.
        const email =
          await this.supportEmailRepository.findLatestPartnerSupportReply(
            agodaId,
          );

        if (!email) {
          skipped.push({
            jobId,
            agodaId,
            reason:
              'No stored Agoda reply for this property. Capture it with POST /api/agoda/retrive-case-email first.',
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
          bookingAmounts: email.collect_booking_amounts,
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
