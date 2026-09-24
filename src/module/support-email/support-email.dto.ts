import { ApiProperty } from '@nestjs/swagger';
import { ReplyStatus } from '@prisma/client';
import {
  RunSupportEmailJobType,
  UpdateSupportEmailReplyStatusType,
} from './support-email.validation';

export class RunSupportEmailJobDto implements RunSupportEmailJobType {
  @ApiProperty({
    type: [String],
    description: 'Job IDs to check for an Agoda Partner Support reply',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
  })
  job_ids: string[];
}

export class RunSupportEmailJobResponseDto {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({
    example:
      'Processed 2 jobs. 1 support email(s) captured (1 newly stored, 0 already on record), ' +
      '2 further conversation message(s) captured, 1 RepliedGreen, 0 RepliedRed, ' +
      '1 without a Partner Support reply, 0 invalid, 0 with errors.',
  })
  message: string;

  @ApiProperty({
    description:
      'processed / invalid / errors from the scrape, plus the derived replyStatuses',
  })
  results: Record<string, any>;
}

export class SupportEmailForJobResponseDto {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: '2 support email(s) retrieved successfully' })
  message: string;

  @ApiProperty({
    description:
      '`emails` is `[]` when nothing has been captured yet for this job. ' +
      'Each item is a full stored support_emails record (subject, ' +
      'body_text, case_id, reservation_ids, attachments with s3_url, ' +
      'should_reopen, reopen_booking_ids, collect_booking_ids, ' +
      'received_at, etc.), newest first.',
    example: {
      jobId: '507f1f77bcf86cd799439011',
      emails: [
        {
          id: '664f1a2b3c4d5e6f7a8b9c0d',
          message_id: '18f2a3b4c5d6e7f8',
          direction: 'incoming',
          agoda_id: '2462187',
          job_id: '507f1f77bcf86cd799439011',
          from_address: 'Agoda <PartnerSupport@agoda.com>',
          subject: 'RE: Case CS123456789',
          case_id: 'CS123456789',
          body_text: '...',
          reservation_ids: ['1234567890'],
          should_reopen: true,
          reopen_booking_ids: ['1234567890'],
          collect_booking_ids: [],
          reply_status: 'RepliedRed',
          attachments: [],
          received_at: '2026-08-30T10:15:00.000Z',
        },
      ],
    },
  })
  data: {
    jobId: string;
    emails: Record<string, any>[];
  };
}

export class SupportEmailByIdResponseDto {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: 'Support email retrieved successfully' })
  message: string;

  @ApiProperty({
    description:
      'The full stored support_emails record (subject, body_text, case_id, ' +
      'reservation_ids, attachments with s3_url, should_reopen, ' +
      'reopen_booking_ids, collect_booking_ids, received_at, etc.)',
    example: {
      id: '664f1a2b3c4d5e6f7a8b9c0d',
      message_id: '18f2a3b4c5d6e7f8',
      direction: 'incoming',
      agoda_id: '2462187',
      job_id: '507f1f77bcf86cd799439011',
      from_address: 'Agoda <PartnerSupport@agoda.com>',
      subject: 'RE: Case CS123456789',
      case_id: 'CS123456789',
      body_text: '...',
      reservation_ids: ['1234567890'],
      should_reopen: true,
      reopen_booking_ids: ['1234567890'],
      collect_booking_ids: [],
      reply_status: 'RepliedRed',
      attachments: [],
      received_at: '2026-08-30T10:15:00.000Z',
    },
  })
  data: Record<string, any>;
}

export class RecheckReplyResponseDto {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({
    example:
      "Recalculated Agoda's reply from 17 Sep 2026 (case 108327712): 69 booking(s) to collect, 0 to reopen. " +
      'Status is now RepliedGreen. Before this check it showed 0 booking(s) to collect, 0 to reopen.',
  })
  message: string;

  @ApiProperty({
    description:
      '`source` is `stored_email` when an already-captured reply was re-parsed from its file, or ' +
      '`gmail_search` when nothing was stored yet. `updated` is false when nothing was written ' +
      '(e.g. no reply found, or the report could not be opened). `before` / `after` compare the ' +
      'stored verdict with the recalculated one.',
    example: {
      jobId: '6aaad6b5d84b3e95fdd7637d',
      agodaId: '2652034',
      source: 'stored_email',
      updated: true,
      supportEmailId: '6ab4fe115b9e579d61309b38',
      caseId: '108327712',
      receivedAt: '2026-09-17T15:42:34.000Z',
      before: { replyStatus: 'RepliedGreen', collect: 0, reopen: 0 },
      after: { replyStatus: 'RepliedGreen', collect: 69, reopen: 0 },
      attachments: [
        {
          filename: 'Aged Booking Product Decision Report (38).xlsx',
          loadedFrom: 's3',
          sheetType: 'booking_matched_status',
          rowCount: 429,
          collect: 69,
          reopen: 0,
          skipped: 360,
          problem: null,
        },
      ],
    },
  })
  data: Record<string, any>;
}

export class UpdateSupportEmailReplyStatusDto
  implements UpdateSupportEmailReplyStatusType
{
  @ApiProperty({
    enum: ReplyStatus,
    example: ReplyStatus.RepliedGreen,
    description:
      'New reply_status for this support_emails document. Also written ' +
      "onto the email's job (job_id) so the two never drift apart.",
  })
  reply_status: ReplyStatus;
}

export class UpdateSupportEmailReplyStatusResponseDto {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({
    example:
      'reply_status updated to RepliedGreen on the support email and its job',
  })
  message: string;

  @ApiProperty({
    description:
      'The updated support_emails record, plus whether a job was also updated ' +
      '(false when the email has no job_id on record).',
    example: {
      email: {
        id: '664f1a2b3c4d5e6f7a8b9c0d',
        message_id: '18f2a3b4c5d6e7f8',
        job_id: '507f1f77bcf86cd799439011',
        reply_status: 'RepliedGreen',
      },
      jobUpdated: true,
    },
  })
  data: {
    email: Record<string, any>;
    jobUpdated: boolean;
  };
}
