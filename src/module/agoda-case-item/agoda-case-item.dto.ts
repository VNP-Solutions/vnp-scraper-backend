import { ApiProperty } from '@nestjs/swagger';
import {
  CreateAgodaCaseItemType,
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

  @ApiProperty({ required: false, example: '1234567890' })
  reservation_id?: string;

  @ApiProperty({ required: false, example: 'John Doe' })
  guest_name?: string;

  @ApiProperty({
    required: false,
    description: 'Check-in date in YYYY-MM-DD format',
    example: '2026-09-01',
  })
  check_in?: string;

  @ApiProperty({
    required: false,
    description: 'Check-out date in YYYY-MM-DD format',
    example: '2026-09-05',
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
  reservation_id?: string;

  @ApiProperty({ required: false })
  guest_name?: string;

  @ApiProperty({ required: false, description: 'YYYY-MM-DD' })
  check_in?: string;

  @ApiProperty({ required: false, description: 'YYYY-MM-DD' })
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
  reservation_id?: string;

  @ApiProperty({ required: false })
  guest_name?: string;

  @ApiProperty({ required: false, description: 'YYYY-MM-DD' })
  check_in?: string;

  @ApiProperty({ required: false, description: 'YYYY-MM-DD' })
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
