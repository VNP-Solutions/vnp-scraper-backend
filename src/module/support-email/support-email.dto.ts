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
