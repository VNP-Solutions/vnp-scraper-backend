import { ApiProperty } from '@nestjs/swagger';
import { JobStatus, OTAProvider, PostingType } from '@prisma/client';

export class CreateJobDto {
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
  start_date?: string;

  @ApiProperty({ required: false })
  end_date?: string;

  @ApiProperty({ required: false })
  log_link?: string;

  @ApiProperty({ required: false })
  live_url?: string;

  @ApiProperty({ required: false })
  watcher_emails?: string[];

  @ApiProperty({ required: false })
  batch_id?: string;
}

export class UpdateJobDto implements Partial<CreateJobDto> {
  @ApiProperty({ required: false })
  name?: string;

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

  @ApiProperty({ required: false })
  start_date?: string;

  @ApiProperty({ required: false })
  end_date?: string;

  @ApiProperty({ required: false })
  log_link?: string;

  @ApiProperty({ required: false })
  live_url?: string;

  @ApiProperty({ required: false })
  batch_id?: string;
}

export class ImportJobsResponseDto {
  @ApiProperty({
    description: 'Number of jobs created',
    example: 25,
  })
  jobsCreated: number;

  @ApiProperty({
    description: 'List of created jobs',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        job_status: { type: 'string' },
        portfolio_name: { type: 'string' },
        sub_portfolio_name: { type: 'string' },
        property_name: { type: 'string' },
        posting_type: { type: 'string' },
        ota_provider: { type: 'string' },
        execution_type: { type: 'string' },
        user_id: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  jobs: any[];
}

export class JobStatusItemDto {
  @ApiProperty({ description: 'Count of jobs', example: 15 })
  count: number;

  @ApiProperty({ description: 'Percentage of total jobs', example: 25.5 })
  percentage: number;
}

export class JobStatusCountDto {
  @ApiProperty({
    description: 'Pending jobs count and percentage',
    type: JobStatusItemDto,
  })
  pending: JobStatusItemDto;

  @ApiProperty({
    description: 'Failed jobs count and percentage',
    type: JobStatusItemDto,
  })
  failed: JobStatusItemDto;

  @ApiProperty({
    description: 'Running jobs count and percentage',
    type: JobStatusItemDto,
  })
  running: JobStatusItemDto;

  @ApiProperty({
    description: 'Completed jobs count and percentage',
    type: JobStatusItemDto,
  })
  completed: JobStatusItemDto;

  @ApiProperty({
    description: 'Stopped jobs count and percentage',
    type: JobStatusItemDto,
  })
  stopped: JobStatusItemDto;

  @ApiProperty({ description: 'Total number of jobs', example: 73 })
  total: number;
}

export class MonthlyJobStatsDto {
  @ApiProperty({ description: 'Month and year', example: '2024-01' })
  month: string;

  @ApiProperty({
    description: 'Pending jobs count and percentage in this month',
    type: JobStatusItemDto,
  })
  pending: JobStatusItemDto;

  @ApiProperty({
    description: 'Failed jobs count and percentage in this month',
    type: JobStatusItemDto,
  })
  failed: JobStatusItemDto;

  @ApiProperty({
    description: 'Running jobs count and percentage in this month',
    type: JobStatusItemDto,
  })
  running: JobStatusItemDto;

  @ApiProperty({
    description: 'Completed jobs count and percentage in this month',
    type: JobStatusItemDto,
  })
  completed: JobStatusItemDto;

  @ApiProperty({
    description: 'Stopped jobs count and percentage in this month',
    type: JobStatusItemDto,
  })
  stopped: JobStatusItemDto;

  @ApiProperty({
    description: 'Total number of jobs in this month',
    example: 54,
  })
  total: number;
}

export class JobStatisticsResponseDto {
  @ApiProperty({
    description: 'Current job status counts',
    type: JobStatusCountDto,
  })
  currentCounts: JobStatusCountDto;

  @ApiProperty({
    description: 'Monthly job statistics for the last 12 months',
    type: [MonthlyJobStatsDto],
    example: [
      { month: '2024-01', pending: 12, failed: 2, running: 5, completed: 35 },
      { month: '2024-02', pending: 8, failed: 1, running: 3, completed: 42 },
    ],
  })
  monthlyStats: MonthlyJobStatsDto[];
}

export class CreateBatchDto {
  @ApiProperty({
    description: 'Name of the batch',
    example: 'December Processing Batch',
  })
  name: string;
}

export class UpdateBatchDto {
  @ApiProperty({
    required: false,
    description: 'Name of the batch',
    example: 'December Processing Batch Updated',
  })
  name?: string;
}

export class BatchResponseDto {
  @ApiProperty({ description: 'Unique identifier of the batch' })
  id: string;

  @ApiProperty({ description: 'Name of the batch' })
  name: string;

  @ApiProperty({ description: 'When the batch was created', type: Date })
  createdAt?: Date;

  @ApiProperty({ description: 'When the batch was last updated', type: Date })
  updatedAt?: Date;

  @ApiProperty({
    description: 'Jobs associated with this batch',
    type: 'array',
    required: false,
  })
  jobs?: any[];
}
