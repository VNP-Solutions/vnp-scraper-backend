import { ApiProperty } from '@nestjs/swagger';
import { JobStatus, PostingType, OTAProvider } from '@prisma/client';

export class CreateJobDto {
  @ApiProperty({ enum: JobStatus, default: JobStatus.Pending })
  job_status?: JobStatus;

  @ApiProperty({ required: false })
  portfolio_id?: string;

  @ApiProperty({ required: false })
  sub_portfolio_id?: string;

  @ApiProperty({ required: false })
  property_id?: string;

  @ApiProperty()
  user_id: string;

  @ApiProperty({ enum: PostingType })
  posting_type: PostingType;

  @ApiProperty()
  portfolio_name: string;

  @ApiProperty()
  sub_portfolio_name: string;

  @ApiProperty()
  property_name: string;

  @ApiProperty()
  billing_type: string;

  @ApiProperty()
  next_due_date: Date;

  @ApiProperty({ enum: OTAProvider })
  ota_provider: OTAProvider;

  @ApiProperty()
  remaining_direct_billed: number;

  @ApiProperty()
  total_collectable: number;

  @ApiProperty()
  total_amount_confirmed: number;

  @ApiProperty()
  execution_type: string;

  @ApiProperty({ default: 0 })
  retries_attempted?: number;

  @ApiProperty({ default: 3 })
  max_retries?: number;

  @ApiProperty({ required: false })
  retry_delay_ms?: number;

  @ApiProperty({ default: 0 })
  priority?: number;

  @ApiProperty()
  job_backoff_length: number;

  @ApiProperty({ required: false })
  queue_name?: string;

  @ApiProperty({ required: false })
  worker_assigned?: string;

  @ApiProperty({ required: false })
  batch_execution_id?: string;
}

export class UpdateJobDto implements Partial<CreateJobDto> {
  @ApiProperty({ required: false })
  job_status?: JobStatus;

  @ApiProperty({ required: false })
  portfolio_name?: string;

  @ApiProperty({ required: false })
  sub_portfolio_name?: string;

  @ApiProperty({ required: false })
  property_name?: string;

  @ApiProperty({ required: false })
  billing_type?: string;

  @ApiProperty({ required: false })
  next_due_date?: Date;

  @ApiProperty({ required: false })
  ota_provider?: OTAProvider;

  @ApiProperty({ required: false })
  remaining_direct_billed?: number;

  @ApiProperty({ required: false })
  total_collectable?: number;

  @ApiProperty({ required: false })
  total_amount_confirmed?: number;

  @ApiProperty({ required: false })
  execution_type?: string;

  @ApiProperty({ required: false })
  job_backoff_length?: number;
}