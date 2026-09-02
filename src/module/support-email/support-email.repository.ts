/**
 * Persists the Agoda Partner Support emails pulled from Gmail.
 *
 * Gmail's `message_id` is the deduplication key: the same message can
 * surface in several runs, but it is only ever stored once. Nothing is
 * overwritten on a repeat sighting.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SupportEmail, SupportEmailDirection } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  ISupportEmailRepository,
  StoreSupportEmailContext,
  StoreSupportEmailResult,
} from './support-email.interface';
import { AGODA_PARTNER_SUPPORT_ADDRESS } from './support-email.types';
import type { ParsedSupportEmail } from './support-email.types';

/**
 * Only metadata is kept. The rows themselves stay in the archived file on
 * S3, so the record cannot drift from what Agoda actually sent.
 */
function toStorableAttachments(
  email: ParsedSupportEmail,
): Prisma.SupportEmailAttachmentCreateInput[] {
  return email.attachments.map((attachment) => ({
    filename: attachment.filename,
    mime_type: attachment.mimeType,
    size_bytes: attachment.sizeBytes,
    format: attachment.format,
    columns: attachment.columns,
    row_count: attachment.rowCount,
    sheet_type: attachment.reopenDecision?.sheetType ?? null,
    parse_error: attachment.parseError ?? null,
    s3_url: attachment.s3Url ?? null,
    s3_key: attachment.s3Key ?? null,
    upload_error: attachment.uploadError ?? null,
  }));
}

@Injectable()
export class SupportEmailRepository implements ISupportEmailRepository {
  private readonly logger = new Logger(SupportEmailRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async isStored(messageId: string): Promise<boolean> {
    const existing = await this.db.supportEmail.findFirst({
      where: { message_id: messageId },
      select: { id: true },
    });
    return Boolean(existing);
  }

  /**
   * Stores the email unless its `message_id` is already on record. Never
   * throws — a storage problem must not fail the scrape.
   */
  async storeIfNew(
    email: ParsedSupportEmail,
    context: StoreSupportEmailContext,
  ): Promise<StoreSupportEmailResult> {
    try {
      const existing = await this.db.supportEmail.findFirst({
        where: { message_id: email.messageId },
        select: { id: true },
      });

      if (existing) {
        this.logger.log(
          `🗃️ Support email ${email.messageId} already stored, skipping (agodaId=${context.agodaId}, jobId=${context.jobId ?? 'n/a'})`,
        );
        return {
          stored: false,
          recordId: existing.id,
          duplicate: true,
        };
      }

      const created = await this.db.supportEmail.create({
        data: {
          message_id: email.messageId,
          thread_id: email.threadId,
          direction: email.direction,
          agoda_id: context.agodaId,
          job_id: context.jobId,
          property_id: context.propertyId,

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
        },
      });

      this.logger.log(
        `🗃️ Stored support email ${email.messageId} (agodaId=${context.agodaId}, jobId=${context.jobId ?? 'n/a'}, ` +
          `direction=${email.direction}, caseId=${email.body.caseId}, attachments=${email.attachments.length}, recordId=${created.id})`,
      );

      return { stored: true, recordId: created.id, duplicate: false };
    } catch (error: any) {
      // A concurrent run inserted the same message between our check and
      // write. P2002 = Prisma's unique constraint violation.
      if (
        (error as Prisma.PrismaClientKnownRequestError)?.code === 'P2002'
      ) {
        return { stored: false, recordId: null, duplicate: true };
      }

      this.logger.error(
        `Failed to store support email ${email.messageId} (agodaId=${context.agodaId}, jobId=${context.jobId ?? 'n/a'}):`,
        error,
      );
      return { stored: false, recordId: null, duplicate: false };
    }
  }

  /**
   * Only inbound Partner Support mail counts: our own submissions are
   * stored under the same `agoda_id` and are frequently newer, so without
   * the `direction` filter the newest record would be our own outgoing mail
   * with no booking IDs on it.
   */
  async findLatestPartnerSupportReply(
    agodaId: string,
    options: { since?: Date | null } = {},
  ): Promise<SupportEmail | null> {
    return this.db.supportEmail.findFirst({
      where: {
        agoda_id: agodaId,
        direction: SupportEmailDirection.incoming,
        // `from_address` is the raw header, e.g. `Agoda <PartnerSupport@agoda.com>`.
        from_address: {
          contains: AGODA_PARTNER_SUPPORT_ADDRESS,
          mode: 'insensitive',
        },
        ...(options.since ? { received_at: { gt: options.since } } : {}),
      },
      // Served by the { agoda_id, received_at } index.
      orderBy: { received_at: 'desc' },
    });
  }
}
