import { ApiProperty } from '@nestjs/swagger';
import { JobStatus, OTAProvider, PostingType } from '@prisma/client';

export class CreateParentRetrievalDto {
  @ApiProperty({
    description: 'Name of the parent retrieval',
    example: 'Batch 2025-01-15',
  })
  name: string;

  @ApiProperty({
    required: false,
    enum: OTAProvider,
    description: 'OTA provider for the parent retrieval',
  })
  ota_provider?: OTAProvider;
}

export class UpdateParentRetrievalDto {
  @ApiProperty({
    required: false,
    description: 'Name of the parent retrieval',
    example: 'Batch 2025-01-15',
  })
  name?: string;

  @ApiProperty({
    required: false,
    enum: OTAProvider,
    description: 'OTA provider for the parent retrieval',
  })
  ota_provider?: OTAProvider;

  @ApiProperty({
    required: false,
    default: false,
    description: 'Archived status of the parent retrieval',
  })
  is_archived?: boolean;
}

export class CreateRetrievalDto {
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

  @ApiProperty({ required: false })
  batch_id?: string;

  @ApiProperty()
  parent_retrieval_id: string;

  @ApiProperty({ enum: PostingType })
  posting_type: PostingType;

  @ApiProperty({ required: false })
  portfolio_name?: string;

  @ApiProperty({ required: false })
  sub_portfolio_name?: string;

  @ApiProperty()
  property_name: string;

  @ApiProperty({ required: false })
  billing_type?: string;

  @ApiProperty({ required: false })
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
  current_url?: string;

  @ApiProperty({ required: false, default: false })
  case_open?: boolean;

  @ApiProperty({ required: false, type: [String] })
  watcher_emails?: string[];

  @ApiProperty({
    required: false,
    type: [String],
    description: 'List of reservation IDs',
  })
  reservations?: string[];
}

export class UpdateRetrievalDto implements Partial<CreateRetrievalDto> {
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
  start_date?: string;

  @ApiProperty({ required: false })
  end_date?: string;

  @ApiProperty({ required: false })
  log_link?: string;

  @ApiProperty({ required: false })
  live_url?: string;

  @ApiProperty({ required: false, type: [String] })
  reservations?: string[];

  @ApiProperty({ required: false })
  batch_id?: string;

  @ApiProperty({ required: false, default: false })
  is_archived?: boolean;
}

export class CreateRetrievalItemDto {
  @ApiProperty()
  retrieval_id: string;

  @ApiProperty()
  parent_retrieval_id: string;

  @ApiProperty()
  property_id: string;

  @ApiProperty()
  guest_name: string;

  @ApiProperty({ required: false })
  reservation_id?: string;

  @ApiProperty({ required: false })
  confirmation_number?: string;

  @ApiProperty()
  check_in_date: Date;

  @ApiProperty()
  check_out_date: Date;

  @ApiProperty()
  room_type: string;

  @ApiProperty({ required: false })
  booking_amount?: number;

  @ApiProperty()
  booked_date: Date;

  @ApiProperty({ default: false })
  has_card_info?: boolean;

  @ApiProperty({ required: false })
  card_info?: {
    card_number: string;
    expiry_date: string;
    cvv?: string;
    reason_for_charge?: string;
    card_holder_name?: string;
  };

  @ApiProperty({ default: false })
  has_payment_info?: boolean;

  @ApiProperty({ required: false })
  payment_info?: {
    total_guest_payment?: number;
    cancellation_fee?: number;
    total_payout?: number;
    amount_to_charge_or_refund: number;
    charge_before?: string;
    amount_to_charge_or_refund_currency?: string;
  };

  @ApiProperty()
  reservation_status: string;

  @ApiProperty({ required: false })
  additional_text?: string;
}

export class CreateBatchDto {
  @ApiProperty({
    description: 'Name of the batch',
    example: 'December Processing Batch',
  })
  name: string;
}

export class UploadRetrievalResponseDto {
  @ApiProperty({ description: 'Created parent retrieval' })
  parentRetrieval: any;

  @ApiProperty({ description: 'Number of retrievals created successfully' })
  retrievalsCreated: number;

  @ApiProperty({ description: 'Number of retrieval items created' })
  retrievalItemsCreated: number;

  @ApiProperty({ description: 'Number of retrievals that failed to create' })
  retrievalsFailed: number;

  @ApiProperty({ description: 'List of failed hotel IDs', type: [String] })
  failedHotelIds: string[];

  @ApiProperty({ description: 'List of created retrievals' })
  retrievals: any[];
}

export class BulkRetrievalBatchUpdateDto {
  @ApiProperty({
    description: 'Array of retrieval IDs to update',
    type: [String],
    example: ['retrieval-id-1', 'retrieval-id-2', 'retrieval-id-3'],
  })
  retrieval_ids: string[];

  @ApiProperty({
    description: 'Batch ID to assign to all retrievals',
    example: 'batch-id-123',
  })
  batch_id: string;
}

export class BulkRetrievalBatchUpdateResponseDto {
  @ApiProperty({
    description: 'Number of retrievals updated',
    example: 5,
  })
  updatedCount: number;

  @ApiProperty({
    description: 'Batch ID that was assigned',
    example: 'batch-id-123',
  })
  batch_id: string;
}

export class BulkArchiveParentRetrievalsDto {
  @ApiProperty({
    description: 'Array of parent retrieval IDs to update',
    type: [String],
    example: ['parent-retrieval-id-1', 'parent-retrieval-id-2', 'parent-retrieval-id-3'],
  })
  parent_retrieval_ids: string[];

  @ApiProperty({
    description: 'Archive status - true to archive, false to unarchive',
    example: true,
  })
  status: boolean;
}

export class BulkArchiveParentRetrievalsResponseDto {
  @ApiProperty({
    description: 'Number of parent retrievals updated',
    example: 5,
  })
  updatedCount: number;

  @ApiProperty({
    description: 'Archive status that was applied',
    example: true,
  })
  status: boolean;
}

export class BulkDeleteParentRetrievalsDto {
  @ApiProperty({
    description: 'Array of parent retrieval IDs to delete',
    type: [String],
    example: ['parent-retrieval-id-1', 'parent-retrieval-id-2', 'parent-retrieval-id-3'],
  })
  parent_retrieval_ids: string[];
}

export class BulkCreateRetrievalsFromDbmsGroupDto {
  @ApiProperty({ example: '12345' })
  hotel_id: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Raw Excel rows for this hotel group',
  })
  rows: Record<string, unknown>[];
}

export class BulkCreateRetrievalsFromDbmsDto {
  @ApiProperty({
    example: 'retrieval-import.xlsx',
    description: 'Parent retrieval name (typically the uploaded filename)',
  })
  parent_retrieval_name: string;

  @ApiProperty({ type: [BulkCreateRetrievalsFromDbmsGroupDto] })
  groups: BulkCreateRetrievalsFromDbmsGroupDto[];
}

export class BulkCreateRetrievalsFromDbmsErrorDto {
  @ApiProperty({ example: '12345' })
  hotel_id: string;

  @ApiProperty({ required: false, example: 'Hotel Grandeur' })
  name?: string;

  @ApiProperty({ example: 'Property not found' })
  error: string;
}

export class BulkCreateRetrievalsFromDbmsCreatedDto {
  @ApiProperty({ example: '12345' })
  hotel_id: string;

  @ApiProperty({ example: 'retrieval-id-1' })
  retrieval_id: string;
}

export class BulkCreateRetrievalsFromDbmsResultDto {
  @ApiProperty({ example: 10 })
  totalCount: number;

  @ApiProperty({ example: 8 })
  successCount: number;

  @ApiProperty({ example: 2 })
  failedCount: number;

  @ApiProperty({ example: 25 })
  retrievalItemsCount: number;

  @ApiProperty({ example: 'parent-retrieval-id-1' })
  parent_retrieval_id: string;

  @ApiProperty({ type: [BulkCreateRetrievalsFromDbmsErrorDto] })
  errors: BulkCreateRetrievalsFromDbmsErrorDto[];

  @ApiProperty({ type: [String], example: ['12345', '67890'] })
  failed_hotel_ids: string[];

  @ApiProperty({ type: [BulkCreateRetrievalsFromDbmsCreatedDto] })
  created: BulkCreateRetrievalsFromDbmsCreatedDto[];
}

export class BulkDeleteParentRetrievalsResponseDto {
  @ApiProperty({
    description: 'Number of parent retrievals deleted',
    example: 5,
  })
  deletedCount: number;

  @ApiProperty({
    description: 'Number of retrievals deleted',
    example: 25,
  })
  deletedRetrievalsCount: number;

  @ApiProperty({
    description: 'Number of retrieval items deleted',
    example: 150,
  })
  deletedRetrievalItemsCount: number;

  @ApiProperty({
    description: 'Array of parent retrieval IDs that were deleted',
    type: [String],
    example: ['parent-retrieval-id-1', 'parent-retrieval-id-2', 'parent-retrieval-id-3'],
  })
  deletedParentRetrievalIds: string[];
}