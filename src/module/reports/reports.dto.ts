import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus, OTAProvider } from '@prisma/client';

export class ReportsRunWithinDto {
  @ApiPropertyOptional({
    description: 'Inclusive lower bound for updatedAt (ISO date string)',
    example: '2026-01-01',
  })
  from?: string | null;

  @ApiPropertyOptional({
    description: 'Inclusive upper bound for updatedAt (ISO date string)',
    example: '2026-03-31',
  })
  to?: string | null;
}

export class ReportsJobDatesDto {
  @ApiPropertyOptional({
    description:
      'Inclusive lower bound for Job/Retrieval.start_date. Accepts MM/DD/YYYY or any string parseable as a Date.',
    example: '01/01/2026',
  })
  start_date?: string | null;

  @ApiPropertyOptional({
    description:
      'Inclusive upper bound for Job/Retrieval.end_date. Accepts MM/DD/YYYY or any string parseable as a Date.',
    example: '03/31/2026',
  })
  end_date?: string | null;
}

export class SearchReportsRequestDto {
  @ApiProperty({
    enum: ['property', 'portfolio'],
    description:
      '"Retrieve reports for" selector. `portfolio` requires `portfolio_id`; `property` allows free-text search across all properties.',
    example: 'portfolio',
  })
  search_mode: 'property' | 'portfolio';

  @ApiPropertyOptional({
    description:
      'Free-text search. Matches Property.name (contains, case-insensitive). If the term is numeric it also matches Property.expedia_id / booking_id / agoda_id exactly.',
    example: '12345',
  })
  search_term?: string | null;

  @ApiPropertyOptional({
    description:
      'Portfolio ObjectId. Required when search_mode is "portfolio".',
    example: '65f0a3c4e2b7a1d2c3e4f5a6',
  })
  portfolio_id?: string | null;

  @ApiPropertyOptional({
    description:
      'Optional explicit set of property ObjectIds to limit the search to (e.g. user picked a subset under a portfolio).',
    type: [String],
    example: ['65f0a3c4e2b7a1d2c3e4f5a6'],
  })
  property_ids?: string[];

  @ApiPropertyOptional({
    enum: OTAProvider,
    isArray: true,
    description: 'One or more OTA providers to include.',
    example: ['Expedia', 'Booking'],
  })
  ota_providers?: OTAProvider[];

  @ApiPropertyOptional({
    enum: ['VCC', 'DB', 'Retrieval'],
    isArray: true,
    description:
      'Job types. VCC/DB match Job.billing_type. Retrieval searches the Retrieval collection.',
    example: ['VCC', 'DB'],
  })
  job_types?: ('VCC' | 'DB' | 'Retrieval')[];

  @ApiPropertyOptional({
    description: '"Run within" date range — filters by updatedAt.',
    type: ReportsRunWithinDto,
  })
  run_within?: ReportsRunWithinDto | null;

  @ApiPropertyOptional({
    enum: JobStatus,
    isArray: true,
    description: '"All Status" — filters by job_status.',
    example: ['Completed', 'Running'],
  })
  job_statuses?: JobStatus[];

  @ApiPropertyOptional({
    enum: ['Manual', 'Recurring'],
    isArray: true,
    description: 'Frequency Type — filters by Job.execution_type.',
    example: ['Manual'],
  })
  frequency_types?: ('Manual' | 'Recurring')[];

  @ApiPropertyOptional({
    enum: ['Over160', 'Under160'],
    isArray: true,
    description:
      'Card Period. Currently filters Jobs only — matches the Boolean entry inside `Job.tags` ' +
      '(stored as `{ field: "over_160", value: <boolean> }`). ' +
      '`["Over160"]` adds `tags: { some: { field: "over_160", value: true } }`. ' +
      '`["Under160"]` adds the same clause with `value: false`. ' +
      'Sending **both** `["Over160", "Under160"]` (or omitting / empty array) covers the entire ' +
      'Boolean value space, so the API drops the `tags` clause entirely and the result is ' +
      'unfiltered by card period (including jobs that have no `over_160` tag yet).',
    example: ['Over160'],
  })
  card_periods?: ('Over160' | 'Under160')[];

  @ApiPropertyOptional({
    description:
      '"Job dates within" — filters by Job/Retrieval.start_date and end_date.',
    type: ReportsJobDatesDto,
  })
  job_dates?: ReportsJobDatesDto | null;

  @ApiPropertyOptional({
    description:
      'Batch filter. Empty / missing means "All". Otherwise filters by batch_id.',
    type: [String],
    example: ['65f0a3c4e2b7a1d2c3e4f5a6'],
  })
  batch_ids?: string[];

  @ApiPropertyOptional({
    description:
      'When false (default), archived jobs/retrievals are excluded from the result.',
    example: false,
  })
  include_archived?: boolean;

  @ApiPropertyOptional({ description: 'Page number (1-indexed)', example: 1 })
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page (max 200)', example: 10 })
  limit?: number;

  @ApiPropertyOptional({
    enum: [
      'updatedAt',
      'createdAt',
      'start_date',
      'end_date',
      'property_name',
      'job_status',
    ],
    description: 'Sort field. Default: updatedAt.',
    example: 'updatedAt',
  })
  sortBy?:
    | 'updatedAt'
    | 'createdAt'
    | 'start_date'
    | 'end_date'
    | 'property_name'
    | 'job_status';

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    description: 'Sort direction. Default: desc.',
    example: 'desc',
  })
  sortOrder?: 'asc' | 'desc';
}

export class ReportsResultPropertyDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  expedia_id?: number | null;

  @ApiPropertyOptional()
  booking_id?: number | null;

  @ApiPropertyOptional()
  agoda_id?: number | null;
}

export class ReportsResultItemDto {
  @ApiProperty({
    enum: ['job', 'retrieval'],
    description:
      'Which collection this row came from. `retrieval` rows omit job-only fields like `tags` and `billing_type`.',
  })
  source: 'job' | 'retrieval';

  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  name?: string | null;

  @ApiProperty({ enum: JobStatus })
  job_status: JobStatus;

  @ApiProperty({ enum: OTAProvider })
  ota_provider: OTAProvider;

  @ApiPropertyOptional()
  billing_type?: string | null;

  @ApiPropertyOptional()
  execution_type?: string | null;

  @ApiPropertyOptional()
  portfolio_id?: string | null;

  @ApiPropertyOptional()
  portfolio_name?: string | null;

  @ApiPropertyOptional()
  sub_portfolio_id?: string | null;

  @ApiPropertyOptional()
  sub_portfolio_name?: string | null;

  @ApiPropertyOptional()
  property_id?: string | null;

  @ApiProperty()
  property_name: string;

  @ApiPropertyOptional()
  batch_id?: string | null;

  @ApiPropertyOptional()
  batch_name?: string | null;

  @ApiPropertyOptional()
  start_date?: string | null;

  @ApiPropertyOptional()
  end_date?: string | null;

  @ApiProperty()
  is_archived: boolean;

  @ApiPropertyOptional({ type: ReportsResultPropertyDto })
  property?: ReportsResultPropertyDto | null;

  @ApiProperty({ description: 'Failed reason (empty string if none).' })
  failed_reason: string;

  @ApiProperty({ type: [Object] })
  screenshot_urls: unknown[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class ReportsResponseMetadataDto {
  @ApiProperty()
  totalDocuments: number;

  @ApiProperty()
  totalJobs: number;

  @ApiProperty()
  totalRetrievals: number;

  @ApiProperty()
  currentPage: number;

  @ApiProperty()
  totalPage: number;

  @ApiProperty()
  limit: number;
}

export class SearchReportsResponseDto {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: 'Reports retrieved successfully' })
  message: string;

  @ApiProperty({ type: [ReportsResultItemDto] })
  data: ReportsResultItemDto[];

  @ApiProperty({ type: ReportsResponseMetadataDto })
  metadata: ReportsResponseMetadataDto;
}
