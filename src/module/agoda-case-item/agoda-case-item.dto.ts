import { ApiProperty } from '@nestjs/swagger';
import { OTAProvider, PostingType } from '@prisma/client';
import {
  BulkDeclineAgodaCaseItemsType,
  CreateAgodaCaseItemType,
  ExportSelectedAgodaCaseItemsType,
  UpdateAgodaCaseItemType,
} from './agoda-case-item.validation';

export class CreateAgodaCaseItemDto implements CreateAgodaCaseItemType {
  @ApiProperty({
    required: false,
    description: 'Property this case item belongs to',
    example: '65f0a3c4e2b7a1d2c3e4f5a6',
  })
  property_id?: string;

  @ApiProperty({
    required: false,
    description: 'Batch this case item belongs to',
    example: '65f0a3c4e2b7a1d2c3e4f5a7',
  })
  batch_id?: string;

  @ApiProperty({
    required: false,
    description: 'Portfolio this case item belongs to',
    example: '65f0a3c4e2b7a1d2c3e4f5a8',
  })
  portfolio_id?: string;

  @ApiProperty({
    required: false,
    description: 'Retrieval this case item belongs to',
    example: '65f0a3c4e2b7a1d2c3e4f5a9',
  })
  retrieval_id?: string;

  @ApiProperty({ required: false, example: '1234567890' })
  reservation_id?: string;

  @ApiProperty({ required: false, example: 'John Doe' })
  guest_name?: string;

  @ApiProperty({
    required: false,
    description: 'Check-in date in MM/DD/YYYY format',
    example: '09/01/2026',
  })
  check_in?: string;

  @ApiProperty({
    required: false,
    description: 'Check-out date in MM/DD/YYYY format',
    example: '09/05/2026',
  })
  check_out?: string;

  @ApiProperty({ required: false, example: '450.00' })
  amount?: string;

  @ApiProperty({ required: false, example: 'USD' })
  currency?: string;

  @ApiProperty({ required: false, example: '450.00' })
  amount_to_charge?: string;

  @ApiProperty({ required: false, example: 'Charged' })
  charge_status?: string;

  @ApiProperty({ required: false, description: 'VCC card number' })
  vcc_card_number?: string;

  @ApiProperty({ required: false, example: '12/28' })
  card_expire?: string;

  @ApiProperty({ required: false, example: '123' })
  card_cvv?: string;

  @ApiProperty({
    required: false,
    default: false,
    description: 'Whether the reservation is missing from the case',
  })
  is_missing?: boolean;

  @ApiProperty({ required: false, example: 'Open' })
  retrival_status?: string;

  @ApiProperty({
    required: false,
    enum: OTAProvider,
    description: 'Which OTA this case item came from',
  })
  ota_provider?: OTAProvider;

  @ApiProperty({
    required: false,
    enum: PostingType,
    description: 'Copied from the originating job at creation time',
  })
  posting_type?: PostingType;

  @ApiProperty({
    required: false,
    default: false,
    description: 'Soft-archive flag',
  })
  is_archived?: boolean;

  @ApiProperty({
    required: false,
    default: false,
    description: 'Whether Agoda declined this case item',
  })
  is_declined?: boolean;

  @ApiProperty({
    required: false,
    description: 'MongoDB ObjectId of the user who created this item',
    example: '65f0a3c4e2b7a1d2c3e4f5a6',
  })
  createdBy?: string;
}

export class UpdateAgodaCaseItemDto implements UpdateAgodaCaseItemType {
  @ApiProperty({ required: false })
  property_id?: string;

  @ApiProperty({ required: false })
  batch_id?: string;

  @ApiProperty({ required: false })
  portfolio_id?: string;

  @ApiProperty({ required: false })
  retrieval_id?: string;

  @ApiProperty({ required: false })
  reservation_id?: string;

  @ApiProperty({ required: false })
  guest_name?: string;

  @ApiProperty({ required: false, description: 'MM/DD/YYYY' })
  check_in?: string;

  @ApiProperty({ required: false, description: 'MM/DD/YYYY' })
  check_out?: string;

  @ApiProperty({ required: false })
  amount?: string;

  @ApiProperty({ required: false })
  currency?: string;

  @ApiProperty({ required: false })
  amount_to_charge?: string;

  @ApiProperty({ required: false })
  charge_status?: string;

  @ApiProperty({ required: false })
  vcc_card_number?: string;

  @ApiProperty({ required: false })
  card_expire?: string;

  @ApiProperty({ required: false })
  card_cvv?: string;

  @ApiProperty({ required: false })
  is_missing?: boolean;

  @ApiProperty({ required: false })
  retrival_status?: string;

  @ApiProperty({ required: false, enum: OTAProvider })
  ota_provider?: OTAProvider;

  @ApiProperty({ required: false, enum: PostingType })
  posting_type?: PostingType;

  @ApiProperty({ required: false })
  is_archived?: boolean;

  @ApiProperty({ required: false })
  is_declined?: boolean;

  @ApiProperty({ required: false })
  createdBy?: string;
}

export class AgodaCaseItemResponseDto {
  @ApiProperty({ description: 'Agoda case item ID' })
  id: string;

  @ApiProperty({ required: false })
  property_id?: string;

  @ApiProperty({ required: false })
  batch_id?: string;

  @ApiProperty({ required: false })
  portfolio_id?: string;

  @ApiProperty({ required: false })
  retrieval_id?: string;

  @ApiProperty({ required: false })
  reservation_id?: string;

  @ApiProperty({ required: false })
  guest_name?: string;

  @ApiProperty({ required: false, description: 'MM/DD/YYYY' })
  check_in?: string;

  @ApiProperty({ required: false, description: 'MM/DD/YYYY' })
  check_out?: string;

  @ApiProperty({ required: false })
  amount?: string;

  @ApiProperty({ required: false })
  currency?: string;

  @ApiProperty({ required: false })
  amount_to_charge?: string;

  @ApiProperty({ required: false })
  charge_status?: string;

  @ApiProperty({ required: false })
  vcc_card_number?: string;

  @ApiProperty({ required: false })
  card_expire?: string;

  @ApiProperty({ required: false })
  card_cvv?: string;

  @ApiProperty()
  is_missing: boolean;

  @ApiProperty({ required: false })
  retrival_status?: string;

  @ApiProperty({ required: false, enum: OTAProvider })
  ota_provider?: OTAProvider;

  @ApiProperty({ required: false, enum: PostingType })
  posting_type?: PostingType;

  @ApiProperty({ default: false })
  is_archived: boolean;

  @ApiProperty({ default: false })
  is_declined: boolean;

  @ApiProperty({ required: false })
  createdBy?: string;

  @ApiProperty({ description: 'Created timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated timestamp' })
  updatedAt: Date;
}

export class AgodaCaseItemListResponseDto {
  @ApiProperty({ type: [AgodaCaseItemResponseDto] })
  items: AgodaCaseItemResponseDto[];

  @ApiProperty({ description: 'Total number of documents' })
  totalDocuments: number;

  @ApiProperty({ description: 'Current page number' })
  currentPage: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPage: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;
}

export class ExportSelectedAgodaCaseItemsDto
  implements ExportSelectedAgodaCaseItemsType
{
  @ApiProperty({
    type: [String],
    description: 'AgodaCaseItem ids to include in the WIP export',
    example: ['65f0a3c4e2b7a1d2c3e4f5a6', '65f0a3c4e2b7a1d2c3e4f5a7'],
  })
  ids: string[];
}

export class BulkDeclineAgodaCaseItemsDto
  implements BulkDeclineAgodaCaseItemsType
{
  @ApiProperty({
    type: [String],
    description: 'AgodaCaseItem ids to mark as declined',
    example: ['65f0a3c4e2b7a1d2c3e4f5a6', '65f0a3c4e2b7a1d2c3e4f5a7'],
  })
  ids: string[];
}

export class BulkDeclineAgodaCaseItemsResponseDto {
  @ApiProperty({
    description: 'Number of items successfully marked as declined',
    example: 5,
  })
  declinedCount: number;

  @ApiProperty({
    description: 'Success message',
    example: 'Successfully marked 5 item(s) as declined',
  })
  message: string;
}

export class ImportWipDeclinedResponseDto {
  @ApiProperty({
    description: 'Number of items successfully imported',
    example: 25,
  })
  successCount: number;

  @ApiProperty({
    description: 'Number of items that failed to import',
    example: 2,
  })
  failedCount: number;

  @ApiProperty({
    description: 'Total number of rows processed',
    example: 27,
  })
  totalRows: number;

  @ApiProperty({
    description: 'Array of error messages for failed rows',
    example: ['Row 3: Property not found for Hotel ID: 12345', 'Row 5: Missing required field: Reservation ID'],
    type: [String],
  })
  errors: string[];

  @ApiProperty({
    description: 'Success message',
    example: 'Successfully imported 25 item(s), 2 failed',
  })
  message: string;
}
