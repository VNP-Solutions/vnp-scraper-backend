import { ApiProperty } from '@nestjs/swagger';
import { JobStatus, OTAProvider, PostingType } from '@prisma/client';

export class CreateRecurringJobDto {
  @ApiProperty({ required: false })
  name?: string;

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
  portfolio_name?: string;

  @ApiProperty()
  sub_portfolio_name?: string;

  @ApiProperty()
  property_name: string;

  @ApiProperty()
  billing_type?: string;

  @ApiProperty()
  next_due_date?: Date;

  @ApiProperty({ required: true })
  schedule_date: string;

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
  job_backoff_length_loading: number;

  @ApiProperty()
  job_backoff_length_selector: number;

  @ApiProperty({ required: false })
  queue_name?: string;

  @ApiProperty({ required: false })
  worker_assigned?: string;

  @ApiProperty({ required: false })
  batch_execution_id?: string;

  @ApiProperty({ required: false })
  log_link?: string;

  @ApiProperty({ required: false })
  live_url?: string;

  @ApiProperty({ required: false })
  watcher_emails?: string[];

  @ApiProperty({ required: false })
  db_billing_duration?: number;

  @ApiProperty({ required: false, default: 1, description: 'Duration in months (default: 1)' })
  duration?: number;
}

export class CreateRecurringJobFromJobDto {
  @ApiProperty({ required: true, description: 'Job ID to create recurring job from' })
  job_id: string;

  @ApiProperty({ required: true, description: 'Schedule date in YYYY-MM-DD format' })
  schedule_date: string;

  @ApiProperty({ required: false, default: 1, description: 'Duration in months (default: 1)' })
  duration?: number;
}

export class UpdateRecurringJobDto {
  @ApiProperty({ required: false })
  schedule_date?: string;

  @ApiProperty({ required: false })
  name?: string;

  @ApiProperty({ required: false, description: 'Duration in months' })
  duration?: number;
}

export class UpdateRecurringJobStatusDto {
  @ApiProperty({ required: true })
  is_active: boolean;
}

export class RecurringJobResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  schedule_date: string;

  @ApiProperty()
  duration: number;

  @ApiProperty()
  is_active: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class RecurringJobWithJobsResponseDto extends RecurringJobResponseDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  jobs: any[];
}
