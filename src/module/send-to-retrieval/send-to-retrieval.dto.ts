import { ApiProperty } from '@nestjs/swagger';
import { RunSendToRetrievalJobType } from './send-to-retrieval.validation';

export class RunSendToRetrievalJobDto implements RunSendToRetrievalJobType {
  @ApiProperty({
    type: [String],
    description:
      'Completed Agoda job IDs to check for a collectable Partner Support reply',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
  })
  job_ids: string[];
}

export class RunSendToRetrievalJobResponseDto {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({
    example:
      'Processed 2 jobs. 1 retrieval(s) created covering 3 booking(s), 1 skipped, 0 invalid, 0 with errors.',
  })
  message: string;

  @ApiProperty({
    description: 'skipped / invalid / errors, plus the created retrieval(s)',
  })
  results: Record<string, any>;
}
