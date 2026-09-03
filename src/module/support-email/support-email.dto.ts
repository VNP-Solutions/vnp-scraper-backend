import { ApiProperty } from '@nestjs/swagger';
import { RunSupportEmailJobType } from './support-email.validation';

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
      attachments: [],
      received_at: '2026-08-30T10:15:00.000Z',
    },
  })
  data: Record<string, any>;
}
