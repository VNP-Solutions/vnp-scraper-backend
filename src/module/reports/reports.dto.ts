import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus, JobTagField, OTAProvider } from '@prisma/client';

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
      'Inclusive lower bound for Job.start_date. Accepts MM/DD/YYYY or any string parseable as a Date.',
    example: '01/01/2026',
  })
  start_date?: string | null;

  @ApiPropertyOptional({
    description:
      'Inclusive upper bound for Job.end_date. Accepts MM/DD/YYYY or any string parseable as a Date.',
    example: '03/31/2026',
  })
  end_date?: string | null;
}

export class SearchReportsRequestDto {
  @ApiPropertyOptional({
    enum: ['property', 'portfolio'],
    description:
      'OPTIONAL hint kept for backwards-compatibility with the original ' +
      '"Retrieve reports for: Property / Portfolio" radio. The backend ' +
      'no longer uses this for routing — it routes purely on the presence ' +
      'of `portfolio_id`, `property_ids`, and `search_term`. Sending it, ' +
      'omitting it, or sending either value produces the same result for ' +
      'the same set of other filters.',
    example: 'portfolio',
  })
  search_mode?: 'property' | 'portfolio' | null;

  @ApiPropertyOptional({
    description:
      'Free-text search. Matches Property.name (contains, case-insensitive). ' +
      'If the term is numeric it also matches Property.expedia_id / ' +
      'booking_id / agoda_id exactly. Independent of every other field — ' +
      'combine freely with `portfolio_id` / `property_ids`.',
    example: '12345',
  })
  search_term?: string | null;

  @ApiPropertyOptional({
    description:
      'Optional portfolio ObjectId. When set, the search is scoped to ' +
      'properties under this portfolio (∩ user access for non-admins). ' +
      'Independent of `property_ids` and `search_term` — combine freely.',
    example: '65f0a3c4e2b7a1d2c3e4f5a6',
  })
  portfolio_id?: string | null;

  @ApiPropertyOptional({
    description:
      'Optional explicit set of property ObjectIds. Independent of ' +
      '`portfolio_id` and `search_term` — combine freely.',
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
    enum: ['VCC', 'DB'],
    isArray: true,
    description:
      'Job types. `VCC` / `DB` match Job.billing_type. ' +
      '(`Retrieval` is still accepted by the request validator for ' +
      'backwards compatibility but is silently ignored — the Reports ' +
      'module no longer queries the Retrieval collection.)',
    example: ['VCC', 'DB'],
  })
  job_types?: ('VCC' | 'DB')[];

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
    enum: ['Manual', 'manual', 'Immediate', 'immediate'],
    isArray: true,
    description:
      'Frequency Type — filters by `Job.execution_type`. ' +
      '**Case-insensitive** — `Manual` / `manual` / `MANUAL` are all ' +
      'treated as equivalent, and likewise for `Immediate` / ' +
      '`immediate` / `IMMEDIATE`. The canonical UI labels are `Manual` ' +
      'and `Immediate`.\n\n' +
      '- `Manual` / `manual` → matches DB values `Manual` / `manual`.\n' +
      '- `Immediate` / `immediate` → matches DB values `Immediate` / ' +
      '  `immediate` (this is the default `execution_type` written by ' +
      '  the Excel-import path when no execution-type cell is provided).',
    example: ['Manual', 'immediate'],
  })
  frequency_types?: ('Manual' | 'manual' | 'Immediate' | 'immediate')[];

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
    description: '"Job dates within" — filters by Job.start_date and end_date.',
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

  @ApiPropertyOptional({
    enum: [0, 1],
    description:
      'Filter jobs by priority (0 = Normal, 1 = High). Omit for no filter.',
    example: 1,
  })
  priority?: 0 | 1;

  @ApiPropertyOptional({ description: 'Page number (1-indexed)', example: 1 })
  page?: number;

  @ApiPropertyOptional({
    description:
      'Items per page. Default `10`. No upper bound — the caller is ' +
      'trusted to pick a sensible page size; very large values will ' +
      'fetch that many Job rows (plus relations) in one shot, which ' +
      'can be slow and memory-heavy.',
    example: 10,
  })
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

export class ReportsJobTagEntryDto {
  @ApiProperty({
    enum: JobTagField,
    description:
      'Tag kind. Currently the only supported value is `over_160` ' +
      '(whether (today - check_out_date) > 160 days for the majority of ' +
      "the job's items at completion time).",
    example: 'over_160',
  })
  field: JobTagField;

  @ApiProperty({
    description: 'Boolean value of the tag for this job.',
    example: true,
  })
  value: boolean;
}

export class ReportsResultItemDto {
  @ApiProperty({
    enum: ['job'],
    description:
      'Always `"job"`. Retained as a constant for response-shape stability ' +
      '(used to also be `"retrieval"` before the Reports module dropped ' +
      'retrieval support).',
  })
  source: 'job';

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

  @ApiProperty({
    type: [ReportsJobTagEntryDto],
    description:
      'Embedded `Job.tags` array as stored in MongoDB. Always returned ' +
      '(empty array if the job has no tags). The only tag kind currently ' +
      'emitted is `over_160`.',
    example: [{ field: 'over_160', value: true }],
  })
  tags: ReportsJobTagEntryDto[];

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

export class SearchReportIdsDataDto {
  @ApiProperty({
    type: [String],
    description:
      'All matching Job IDs. Feed directly into ' +
      '`POST /reports/export-master` (or the legacy ' +
      '`POST /jobs/export-master`).',
    example: ['65f0a3c4e2b7a1d2c3e4f5a6', '65f0a3c4e2b7a1d2c3e4f5a7'],
  })
  job_ids: string[];
}

export class SearchReportIdsMetadataDto {
  @ApiProperty({ example: 41 })
  totalDocuments: number;

  @ApiProperty({ example: 41 })
  totalJobs: number;
}

export class SearchReportIdsResponseDto {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: 'Matching report IDs retrieved successfully' })
  message: string;

  @ApiProperty({ type: SearchReportIdsDataDto })
  data: SearchReportIdsDataDto;

  @ApiProperty({ type: SearchReportIdsMetadataDto })
  metadata: SearchReportIdsMetadataDto;
}

export class ReportsStatusItemDto {
  @ApiProperty({ description: 'Number of jobs with this status', example: 12 })
  count: number;

  @ApiProperty({
    description: 'Percentage of total jobs',
    example: 25.5,
  })
  percentage: number;
}

export class ReportsCurrentCountsDto {
  @ApiProperty({ type: ReportsStatusItemDto })
  pending: ReportsStatusItemDto;

  @ApiProperty({ type: ReportsStatusItemDto })
  failed: ReportsStatusItemDto;

  @ApiProperty({ type: ReportsStatusItemDto })
  running: ReportsStatusItemDto;

  @ApiProperty({ type: ReportsStatusItemDto })
  completed: ReportsStatusItemDto;

  @ApiProperty({ type: ReportsStatusItemDto })
  stopped: ReportsStatusItemDto;

  @ApiProperty({ type: ReportsStatusItemDto })
  nothingToReport: ReportsStatusItemDto;

  @ApiProperty({ type: ReportsStatusItemDto })
  manual: ReportsStatusItemDto;

  @ApiProperty({ type: ReportsStatusItemDto })
  highPriority: ReportsStatusItemDto;

  @ApiProperty({ description: 'Total number of matching jobs', example: 47 })
  total: number;
}

export class ReportsStatisticsResponseDto {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: 'Report statistics retrieved successfully' })
  message: string;

  @ApiProperty({ type: ReportsCurrentCountsDto })
  data: ReportsCurrentCountsDto;
}

export class ExportReportsMasterRequestDto {
  @ApiProperty({
    type: [String],
    description:
      'Job IDs to include in the export. Each becomes one XLSX file ' +
      'inside the ZIP, named ' +
      '`{OTA}-{property}-{startDate}-{endDate}.xlsx`.\n\n' +
      '**Constraints:**\n' +
      '- Must contain at least one ID (empty arrays return 400).\n' +
      '- Maximum **8000 IDs per request**. Larger selections return ' +
      '  400 with a "narrow your filters" message — the cap exists ' +
      '  because each request is queued as a single SQS message ' +
      '  (256 KB hard limit) and consumed in a single Node process ' +
      '  (heap-bound). Frontends should chunk if they ever need more.',
    example: ['65f0a3c4e2b7a1d2c3e4f5a6', '65f0a3c4e2b7a1d2c3e4f5a7'],
  })
  job_ids: string[];
}
