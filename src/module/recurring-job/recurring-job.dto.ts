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

  @ApiProperty({ required: false, description: 'Initial date to start from (YYYY-MM-DD format). If provided, creates historical jobs from this date to the current month.' })
  initial_date?: string;
}

export class CreateRecurringJobFromJobDto {
  @ApiProperty({ required: true, description: 'Job ID to create recurring job from' })
  job_id: string;

  @ApiProperty({ required: true, description: 'Schedule date in YYYY-MM-DD format' })
  schedule_date: string;

  @ApiProperty({ required: false, default: 1, description: 'Duration in months (default: 1)' })
  duration?: number;

  @ApiProperty({ required: false, description: 'Initial date to start from (YYYY-MM-DD format). If provided, creates historical jobs from this date to the current month.' })
  initial_date?: string;
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

  @ApiProperty({ required: false })
  next_date?: string;

  @ApiProperty({ enum: OTAProvider })
  ota_provider: OTAProvider;

  @ApiProperty()
  duration: number;

  @ApiProperty()
  is_active: boolean;

  @ApiProperty({ required: false })
  portfolio_id?: string;

  @ApiProperty({ required: false })
  portfolio_name?: string;

  @ApiProperty({ required: false })
  property_id?: string;

  @ApiProperty({ required: false })
  property_name?: string;

  @ApiProperty({ required: false, description: 'Hotel ID based on OTA provider' })
  hotel_id?: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false, description: 'Count of buckets' })
  bucket_count?: number;

  @ApiProperty({ required: false, description: 'Count of jobs' })
  job_count?: number;
}

export class RecurringReportBucketResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  recurring_id: string;

  @ApiProperty()
  bucket_number: number;

  @ApiProperty({ description: 'Auto-generated name, e.g. "Reporting for Start MMM - End MMM YYYY"' })
  name: string;

  @ApiProperty({ description: 'Total count of jobs in this bucket' })
  job_count: number;

  @ApiProperty({ description: 'Count of running jobs (Pending + Running)' })
  running_count: number;

  @ApiProperty({ description: 'Count of failed jobs' })
  failed_count: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class RecurringJobWithBucketsResponseDto extends RecurringJobResponseDto {
  @ApiProperty({ type: [RecurringReportBucketResponseDto] })
  buckets: RecurringReportBucketResponseDto[];

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  jobs: any[];
}

export class BulkDeleteRecurringJobDto {
  @ApiProperty({
    type: [String],
    description: 'Array of recurring job IDs to delete',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
  })
  ids: string[];
}

export class UpdateAllJobsUnderRecurringJobDto {
  @ApiProperty({ 
    required: false, 
    description: 'Change failed jobs to pending. Set to true to update status from Failed to Pending.',
    example: true 
  })
  change_failed_to_pending?: boolean;

  @ApiProperty({ 
    required: false, 
    description: 'New recurring date in YYYY-MM-DD format. This will update the schedule_date for all jobs and update the scheduler.',
    example: '2026-05-15'
  })
  new_recurring_date?: string;
}

export class TransferRecurringJobsByDateDto {
  @ApiProperty({ 
    required: true, 
    description: 'Source date in YYYY-MM-DD format. All recurring jobs scheduled on this date will be transferred.',
    example: '2026-05-15'
  })
  from_date: string;

  @ApiProperty({ 
    required: true, 
    description: 'Target date in YYYY-MM-DD format. All recurring jobs will be moved to this date.',
    example: '2026-06-20'
  })
  to_date: string;
}

export class DbmsIngestPropertyDto {
  @ApiProperty({ description: 'Property name' })
  name: string;

  @ApiProperty({ description: 'Expedia hotel ID used to look up the property' })
  expedia_id: number;

  @ApiProperty({ description: 'Initial (historical) date in YYYY-MM-DD format' })
  initial_date: string;

  @ApiProperty({ description: 'Recurring schedule date in YYYY-MM-DD format' })
  recurring_date: string;

  @ApiProperty({ description: 'Bucket duration in months (1–12)', minimum: 1, maximum: 12 })
  duration: number;

  @ApiProperty({ enum: ['OTA', 'OTA_PLUS'], description: 'Posting type for the recurring job' })
  posting_type: string;
}

export class DbmsIngestDto {
  @ApiProperty({ type: [DbmsIngestPropertyDto], description: 'Array of properties to create recurring jobs for' })
  properties: DbmsIngestPropertyDto[];
}

export class DbmsIngestResponseDto {
  @ApiProperty({ description: 'Human-readable result message' })
  message: string;
}

export class DbmsIngestErrorItemDto {
  @ApiProperty({ description: 'Property name from the request' })
  name: string;

  @ApiProperty({ description: 'Reason this property failed validation' })
  error_message: string;
}

export class DbmsIngestErrorsDto {
  @ApiProperty({ type: [Number], description: 'Expedia IDs that failed validation' })
  expedia_ids: number[];

  @ApiProperty({ type: [DbmsIngestErrorItemDto], description: 'Descriptions of each failure' })
  descriptions: DbmsIngestErrorItemDto[];
}

export class DbmsIngestErrorDto {
  @ApiProperty({ description: 'Human-readable error message' })
  message: string;

  @ApiProperty({ type: DbmsIngestErrorsDto })
  errors: DbmsIngestErrorsDto;
}
