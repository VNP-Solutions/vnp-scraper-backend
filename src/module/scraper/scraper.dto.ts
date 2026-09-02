import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus } from '@prisma/client';

export class HealthResponseDto {
  @ApiProperty({ example: 'Connection established' })
  messge: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: 500 })
  status: number;

  @ApiProperty({ example: 'Server error' })
  message: string;

  @ApiProperty({ example: 'Detailed error message', required: false })
  error?: string;
}

export class ScrapingStateDto {
  @ApiProperty({ example: 'running' })
  state: string;

  @ApiProperty({ example: 50 })
  progress: number;
}

export class ScrapingStatusResponseDto {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Scraping status retrieved successfully' })
  message: string;

  @ApiProperty({ type: ScrapingStateDto })
  data: ScrapingStateDto;
}

export class PauseResumeStopResponseDto {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Scraping paused successfully' })
  message: string;

  @ApiProperty({ type: ScrapingStateDto, required: false })
  data?: ScrapingStateDto;
}

export class PropertyRunJobRequestDto {
  @ApiProperty({
    example: '01/01/2024',
    description: 'Start date for scraping (MM/DD/YYYY format)',
  })
  startDate: string;

  @ApiProperty({
    example: '01/31/2024',
    description: 'End date for scraping (MM/DD/YYYY format)',
  })
  endDate: string;

  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'MongoDB ObjectId of the job to run.',
  })
  jobId: string;

  @ApiPropertyOptional({
    example: '507f1f77bcf86cd799439011',
    description:
      'Property id. With credentials_id and a successful DBMS credential extract, triggers PUT /property-credentials/:credentials_id before the scraper run.',
  })
  property_id?: string;

  @ApiPropertyOptional({
    example: '507f1f77bcf86cd799439011',
    description:
      'Property credentials document id. Used with property_id when persisting credentials from DBMS.',
  })
  credentials_id?: string;

  @ApiPropertyOptional({
    enum: ['expedia', 'agoda', 'booking'],
    description:
      'OTA key for DBMS lookup query param. When set with ota_id (and DBMS env vars), credentials may be refreshed before the run.',
  })
  ota_provider?: 'expedia' | 'agoda' | 'booking';

  @ApiPropertyOptional({
    description:
      'OTA identifier for DBMS lookup (string or number). Paired with ota_provider.',
    oneOf: [{ type: 'string' }, { type: 'number' }],
  })
  ota_id?: string | number;
}

export class RetrievalRunJobRequestDto {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'MongoDB ObjectId of the retrieval to run.',
  })
  retrieval_id: string;
}

export class PropertyRunJobResponseDto {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Property search completed successfully' })
  message: string;

  @ApiProperty({ example: '12345' })
  propertyId: string;

  @ApiProperty({ example: 'job_12345_1703123456789' })
  jobId: string;
}

export class ReservationDto {
  @ApiProperty({ example: 'RES123' })
  reservationId: string;

  @ApiProperty({ example: 'PROP456' })
  propertyId: string;
}

export class ReservationRunJobRequestDto {
  @ApiProperty({ type: [ReservationDto] })
  reservations: ReservationDto[];
}

export class ReservationRunJobResponseDto {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Reservation search completed successfully' })
  message: string;

  @ApiProperty({ type: [ReservationDto] })
  reservations: ReservationDto[];

  @ApiProperty({ example: 'reservation_job_1703123456789' })
  jobId: string;
}

export class AllJobItemsResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({
    description:
      'Array of job items. Each item also includes two Expedia-only derived fields used by the chargeback dashboard:\n' +
      '- `over_160` (boolean | null): `true` when (today − check_out_date) is more than 160 days. `null` for Booking / Agoda or when check_out_date is missing.\n' +
      '- `days_since_checkout` (number | null): whole-day count from check_out_date to today. `null` for Booking / Agoda or when check_out_date is missing.\n' +
      'These values are lazily refreshed once per day on the first read, so the response always reflects the current day.',
    type: 'array',
  })
  data: any[];

  @ApiProperty({
    description: 'Response metadata',
    example: { total: 25, jobId: '507f1f77bcf86cd799439011' },
  })
  metadata: {
    total: number;
    jobId: string;
  };
}

export class ResumeScrapingRequestDto {
  @ApiProperty({
    example: '01/01/2024',
    description: 'Start date for scraping (MM/DD/YYYY format)',
  })
  startDate: string;

  @ApiProperty({
    example: '01/31/2024',
    description: 'End date for scraping (MM/DD/YYYY format)',
  })
  endDate: string;

  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'MongoDB ObjectId of the job to resume',
  })
  jobId: string;
}

export class StopScrapingRequestDto {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'MongoDB ObjectId of the job to stop',
  })
  jobId: string;
}

export class RerunFailedJobRequestDto {
  @ApiProperty({
    example: '01/01/2024',
    description: 'Start date for scraping (MM/DD/YYYY format)',
  })
  startDate: string;

  @ApiProperty({
    example: '01/31/2024',
    description: 'End date for scraping (MM/DD/YYYY format)',
  })
  endDate: string;

  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'MongoDB ObjectId of the failed/partial job to rerun',
  })
  jobId: string;
}

export class JobProgressDto {
  @ApiProperty({ example: 150 })
  totalItems: number;

  @ApiProperty({ example: 140 })
  itemsWithCardInfo: number;

  @ApiProperty({ example: 135 })
  itemsWithPaymentInfo: number;

  @ApiProperty({ example: 90 })
  completionPercentage: number;
}

export class RerunFailedJobResponseDto {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Failed job rerun completed successfully' })
  message: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  jobId: string;

  @ApiProperty({ example: 'Failed' })
  originalStatus: string;

  @ApiProperty({ example: 'Completed' })
  finalStatus: string;

  @ApiProperty({ type: JobProgressDto })
  progress: JobProgressDto;
}

export class BatchPropertyJobDto {
  @ApiProperty({
    example: '01/01/2024',
    description: 'Start date for scraping (MM/DD/YYYY format)',
  })
  startDate: string;

  @ApiProperty({
    example: '01/31/2024',
    description: 'End date for scraping (MM/DD/YYYY format)',
  })
  endDate: string;

  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'MongoDB ObjectId of the job to run.',
  })
  jobId: string;
}

export class BatchPropertyRunJobRequestDto {
  @ApiProperty({
    type: [BatchPropertyJobDto],
    description:
      'List of jobs to execute. Each job will be routed to the appropriate scraper based on its OTA provider (Expedia, Agoda, Booking).',
  })
  jobs: BatchPropertyJobDto[];

  @ApiPropertyOptional({
    example: '507f1f77bcf86cd799439011',
    description:
      'Optional ScheduledJob document id (e.g. from /scraper/scheduled). Forwarded to the Booking scraper on credential-grouped bulk runs as scheduled_job_id.',
  })
  scheduled_job_id?: string;
}

export class BatchJobResultDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  jobId: string;

  @ApiProperty({ example: 'Expedia' })
  otaProvider: string;

  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Property search completed successfully' })
  message: string;

  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ required: false })
  error?: string;

  @ApiProperty({ required: false })
  data?: any;
}

export class BatchPropertyRunJobResponseDto {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Batch property run completed' })
  message: string;

  @ApiProperty({ type: [BatchJobResultDto] })
  results: BatchJobResultDto[];

  @ApiProperty({ example: 5 })
  totalJobs: number;

  @ApiProperty({ example: 4 })
  successfulJobs: number;

  @ApiProperty({ example: 1 })
  failedJobs: number;
}

export class BatchRetrievalJobDto {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'MongoDB ObjectId of the retrieval to run.',
  })
  retrieval_id: string;
}

export class BatchRetrievalRunJobRequestDto {
  @ApiProperty({
    type: [BatchRetrievalJobDto],
    description:
      'List of retrieval jobs to execute. Each retrieval job will be automatically routed to the appropriate retrieval server (Expedia or Agoda) based on the OTA provider of the retrieval.',
  })
  jobs: BatchRetrievalJobDto[];
}

export class BatchRetrievalRunJobResponseDto {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Batch retrieval run completed' })
  message: string;

  @ApiProperty({ type: [BatchJobResultDto] })
  results: BatchJobResultDto[];

  @ApiProperty({ example: 5 })
  totalJobs: number;

  @ApiProperty({ example: 4 })
  successfulJobs: number;

  @ApiProperty({ example: 1 })
  failedJobs: number;
}

export class CreateScheduledJobDto {
  @ApiProperty({
    description: 'Date in YYYY-MM-DD format',
    example: '2024-12-25',
  })
  date: string;

  @ApiProperty({
    description: 'Array of job IDs to schedule',
    type: [String],
    example: ['job-id-1', 'job-id-2', 'job-id-3'],
    required: false,
  })
  job_ids?: string[];

  @ApiProperty({
    description: 'Array of retrieval IDs to schedule',
    type: [String],
    example: ['retrieval-id-1', 'retrieval-id-2', 'retrieval-id-3'],
    required: false,
  })
  retrieval_ids?: string[];
}

export class ScheduledJobResponseDto {
  @ApiProperty({ description: 'Unique identifier of the scheduled job' })
  id: string;

  @ApiProperty({
    description: 'Date in YYYY-MM-DD format',
    example: '2024-12-25',
  })
  date: string;

  @ApiProperty({
    description: 'Array of job IDs',
    type: [String],
    example: ['job-id-1', 'job-id-2', 'job-id-3'],
  })
  job_ids: string[];

  @ApiProperty({
    description: 'Array of retrieval IDs',
    type: [String],
    example: ['retrieval-id-1', 'retrieval-id-2', 'retrieval-id-3'],
  })
  retrieval_ids: string[];

  @ApiProperty({
    description: 'When the scheduled job was created',
    type: Date,
  })
  createdAt?: Date;

  @ApiProperty({
    description: 'When the scheduled job was last updated',
    type: Date,
  })
  updatedAt?: Date;
}

export class RemoveJobsFromScheduledJobDto {
  @ApiProperty({
    description: 'Date in YYYY-MM-DD format',
    example: '2024-12-25',
  })
  date: string;

  @ApiProperty({
    description: 'Array of job IDs to remove from schedule',
    type: [String],
    example: ['job-id-1', 'job-id-2', 'job-id-3'],
    required: false,
  })
  job_ids?: string[];

  @ApiProperty({
    description: 'Array of retrieval IDs to remove from schedule',
    type: [String],
    example: ['retrieval-id-1', 'retrieval-id-2', 'retrieval-id-3'],
    required: false,
  })
  retrieval_ids?: string[];
}

export class RemoveJobIdsFromAllScheduledJobsDto {
  @ApiProperty({
    description: 'Array of job IDs to remove from all scheduled jobs',
    type: [String],
    example: ['job-id-1', 'job-id-2', 'job-id-3'],
  })
  job_ids: string[];
}

export class RemoveJobsFromScheduledJobResponseDto {
  @ApiProperty({
    description: 'Number of jobs successfully removed',
    example: 2,
  })
  removedCount: number;

  @ApiProperty({
    description: 'Number of job IDs that were not found in the scheduled job',
    example: 1,
  })
  notFoundCount: number;

  @ApiProperty({
    description: 'Array of job IDs that were successfully removed',
    type: [String],
    example: ['job-id-1', 'job-id-2'],
  })
  removedJobIds: string[];

  @ApiProperty({
    description: 'Array of job IDs that were not found in the scheduled job',
    type: [String],
    example: ['job-id-3'],
  })
  notFoundJobIds: string[];

  @ApiProperty({
    description: 'Number of retrievals successfully removed',
    example: 1,
  })
  removedRetrievalCount: number;

  @ApiProperty({
    description:
      'Number of retrieval IDs that were not found in the scheduled job',
    example: 0,
  })
  notFoundRetrievalCount: number;

  @ApiProperty({
    description: 'Array of retrieval IDs that were successfully removed',
    type: [String],
    example: ['retrieval-id-1'],
  })
  removedRetrievalIds: string[];

  @ApiProperty({
    description:
      'Array of retrieval IDs that were not found in the scheduled job',
    type: [String],
    example: [],
  })
  notFoundRetrievalIds: string[];

  @ApiProperty({
    description: 'Updated scheduled job (null if deleted)',
    type: ScheduledJobResponseDto,
    nullable: true,
  })
  scheduledJob: ScheduledJobResponseDto | null;
}

export class CreateScheduledJobResponseDto {
  @ApiProperty({
    description: 'Number of new job IDs added',
    example: 3,
  })
  addedCount: number;

  @ApiProperty({
    description: 'Number of job IDs that were skipped (already existed)',
    example: 2,
  })
  skippedCount: number;

  @ApiProperty({
    description: 'Array of job IDs that were added',
    type: [String],
    example: ['job-id-1', 'job-id-2', 'job-id-3'],
  })
  addedJobIds: string[];

  @ApiProperty({
    description: 'Array of job IDs that were skipped',
    type: [String],
    example: ['job-id-4', 'job-id-5'],
  })
  skippedJobIds: string[];

  @ApiProperty({
    description: 'Number of new retrieval IDs added',
    example: 2,
  })
  addedRetrievalCount: number;

  @ApiProperty({
    description: 'Number of retrieval IDs that were skipped (already existed)',
    example: 1,
  })
  skippedRetrievalCount: number;

  @ApiProperty({
    description: 'Array of retrieval IDs that were added',
    type: [String],
    example: ['retrieval-id-1', 'retrieval-id-2'],
  })
  addedRetrievalIds: string[];

  @ApiProperty({
    description: 'Array of retrieval IDs that were skipped',
    type: [String],
    example: ['retrieval-id-3'],
  })
  skippedRetrievalIds: string[];

  @ApiProperty({
    description: 'The scheduled job record',
    type: ScheduledJobResponseDto,
  })
  scheduledJob: ScheduledJobResponseDto;
}

export class RemoveJobIdsFromAllScheduledJobsResponseDto {
  @ApiProperty({
    description:
      'Total number of jobs successfully removed across all scheduled jobs',
    example: 5,
  })
  totalRemovedCount: number;

  @ApiProperty({
    description: 'Number of job IDs that were not found in any scheduled job',
    example: 2,
  })
  notFoundCount: number;

  @ApiProperty({
    description: 'Array of job IDs that were successfully removed',
    type: [String],
    example: ['job-id-1', 'job-id-2', 'job-id-3'],
  })
  removedJobIds: string[];

  @ApiProperty({
    description: 'Array of job IDs that were not found in any scheduled job',
    type: [String],
    example: ['job-id-4', 'job-id-5'],
  })
  notFoundJobIds: string[];

  @ApiProperty({
    description:
      'Number of scheduled jobs that were deleted because they became empty',
    example: 2,
  })
  deletedScheduledJobsCount: number;
}

// ─── Get Jobs by Schedule Date + Status, and Create Scheduled Job ────────────

export class GetJobsByScheduleDateAndStatusQueryDto {
  @ApiProperty({
    description:
      'Date used to create the ScheduledJob record in DB (YYYY-MM-DD)',
    example: '2024-06-15',
  })
  creating_date: string;

  @ApiProperty({
    description:
      'Date used to query jobs by their schedule_date field (YYYY-MM-DD)',
    example: '2024-06-15',
  })
  schedule_date: string;

  @ApiProperty({
    description: 'Job status to filter by',
    enum: JobStatus,
    example: JobStatus.Pending,
  })
  status: JobStatus;
}

export class JobSummaryDto {
  @ApiProperty({ example: '664f1a2b3c4d5e6f7a8b9c0d' })
  id: string;

  @ApiProperty({
    example: 'Property A Expedia Job',
    required: false,
    nullable: true,
  })
  name: string | null;

  @ApiProperty({ enum: JobStatus, example: JobStatus.Pending })
  job_status: JobStatus;

  @ApiProperty({ example: '2024-06-15', required: false, nullable: true })
  schedule_date: string | null;

  @ApiProperty({ example: 'Expedia' })
  ota_provider: string;

  @ApiProperty({ example: 'My Portfolio', required: false, nullable: true })
  portfolio_name: string | null;

  @ApiProperty({ example: 'Property Name' })
  property_name: string;
}

export class JobsWithScheduledJobResponseDto {
  @ApiProperty({
    description: 'The ScheduledJob record that was created or already existed',
    type: ScheduledJobResponseDto,
  })
  scheduledJob: ScheduledJobResponseDto;

  @ApiProperty({
    description:
      'Whether the ScheduledJob record was freshly created (true) or already existed (false)',
    example: true,
  })
  created: boolean;

  @ApiProperty({
    description: 'Jobs matching the given schedule date and status',
    type: [JobSummaryDto],
  })
  jobs: JobSummaryDto[];

  @ApiProperty({ example: 5 })
  total: number;
}

export class UploadJobItemsValidationErrorDto {
  @ApiProperty({ example: 2 })
  row: number;

  @ApiProperty({
    example: "OTA value 'Booking' does not match job OTA provider 'Expedia'",
  })
  message: string;
}

export class UploadJobItemsResponseDto {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: 'Job items uploaded successfully' })
  message: string;

  @ApiProperty({
    description: 'Upload summary',
    example: { uploaded: 10, created: 8, updated: 2 },
  })
  data: {
    uploaded: number;
    created: number;
    updated: number;
  };
}

export class BulkUploadJobItemsAcceptedDto {
  @ApiProperty({ example: 202 })
  statusCode: number;

  @ApiProperty({
    example:
      'Bulk job-items import accepted and is being processed. You will receive an email report when it completes.',
  })
  message: string;

  @ApiProperty({
    description: 'Tracking information',
    example: {
      fileName: 'bulk-import.csv',
      enqueuedAt: '2026-07-22T09:30:00.000Z',
    },
  })
  data: {
    fileName: string;
    enqueuedAt: string;
  };
}

export class ReopenAllReservationsRequestDto {
  @ApiProperty({
    type: [String],
    description:
      'MongoDB _ids of jobs to re-run. Must be non-empty. A job is only ' +
      'submitted if it is not already Running/InQueue, has a ' +
      'need_help_file_url on record, its property has a valid agoda_id, ' +
      'and it has valid Agoda credentials — otherwise it is reported under ' +
      'results.invalid.',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
  })
  job_ids: string[];
}

export class ReopenAllReservationsSubmittedDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  jobId: string;

  @ApiProperty({ example: '123456' })
  agodaId: string;

  @ApiProperty({ example: 'submitted' })
  status: string;
}

export class ReopenAllReservationsInvalidDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439012' })
  jobId: string;

  @ApiProperty({
    example:
      'Job 507f1f77bcf86cd799439012 has no need_help_file_url on record — nothing to re-attach. A property run must complete successfully first.',
  })
  reason: string;

  @ApiProperty({ example: 'Pending' })
  currentStatus: string;
}

export class ReopenAllReservationsResultsDto {
  @ApiProperty({ type: [ReopenAllReservationsSubmittedDto] })
  submitted: ReopenAllReservationsSubmittedDto[];

  @ApiProperty({ type: [ReopenAllReservationsInvalidDto] })
  invalid: ReopenAllReservationsInvalidDto[];

  @ApiProperty({ type: [Object], description: 'Per-job errors, if any' })
  errors: any[];
}

export class ReopenAllReservationsResponseDto {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({
    example: 'Processed 2 jobs. 1 submitted, 1 invalid, 0 with errors.',
  })
  message: string;

  @ApiProperty({ type: ReopenAllReservationsResultsDto })
  results: ReopenAllReservationsResultsDto;
}

export class BulkUploadJobItemsSyncResultDto {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: 'Bulk job-items import completed' })
  message: string;

  @ApiProperty({
    description: 'Import report',
    example: {
      status: 'partial',
      totalRows: 100,
      processedJobs: 8,
      created: 75,
      updated: 25,
      errors: [{ row: 12, message: 'Could not resolve a unique job' }],
    },
  })
  data: {
    status: string;
    totalRows: number;
    processedJobs: number;
    created: number;
    updated: number;
    errors: UploadJobItemsValidationErrorDto[];
  };
}
