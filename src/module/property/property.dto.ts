import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePropertyDto {
  @ApiProperty({
    description: 'Property name',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Portfolio ID',
  })
  portfolio_id?: string;

  @ApiPropertyOptional({
    description: 'Sub Portfolio ID',
  })
  sub_portfolio_id?: string;

  @ApiPropertyOptional({
    description: 'Expedia ID',
  })
  expedia_id?: number;

  @ApiPropertyOptional({
    description: 'Expedia Status',
  })
  expedia_status?: string;

  @ApiPropertyOptional({
    description: 'Booking.com ID',
  })
  booking_id?: number;

  @ApiPropertyOptional({
    description: 'Booking.com Status',
  })
  booking_status?: string;

  @ApiPropertyOptional({
    description: 'Agoda ID',
  })
  agoda_id?: number;

  @ApiPropertyOptional({
    description: 'Agoda Status',
  })
  agoda_status?: string;

  @ApiPropertyOptional({
    description: 'Assigned phone number (often matches linked PhoneNumberSlot)',
  })
  phone_number?: string;

  @ApiPropertyOptional({
    description: 'Slot index (often matches linked PhoneNumberSlot.slot)',
  })
  slot?: number;

  @ApiPropertyOptional({
    description: 'PhoneNumberSlot document id — which pool row this property uses',
  })
  phone_number_slot_id?: string;
}

export class UpdatePropertyDto {
  @ApiPropertyOptional({
    description: 'Property name',
    example: 'My Property',
  })
  name?: string;

  @ApiPropertyOptional({
    description: 'Portfolio ID',
  })
  portfolio_id?: string;

  @ApiPropertyOptional({
    description: 'Sub Portfolio ID',
  })
  sub_portfolio_id?: string;

  @ApiPropertyOptional({
    description: 'Expedia ID',
  })
  expedia_id?: number;

  @ApiPropertyOptional({
    description: 'Expedia Status',
  })
  expedia_status?: string;

  @ApiPropertyOptional({
    description: 'Booking.com ID',
  })
  booking_id?: number;

  @ApiPropertyOptional({
    description: 'Booking.com Status',
  })
  booking_status?: string;

  @ApiPropertyOptional({
    description: 'Agoda ID',
  })
  agoda_id?: number;

  @ApiPropertyOptional({
    description: 'Agoda Status',
  })
  agoda_status?: string;

  @ApiPropertyOptional({
    description: 'Assigned phone number (often matches linked PhoneNumberSlot)',
  })
  phone_number?: string;

  @ApiPropertyOptional({
    description: 'Slot index (often matches linked PhoneNumberSlot.slot)',
  })
  slot?: number;

  @ApiPropertyOptional({
    description: 'PhoneNumberSlot document id — which pool row this property uses',
  })
  phone_number_slot_id?: string;
}

export class ImportPropertiesResponseDto {
  @ApiProperty({
    description: 'Number of portfolios created',
    example: 5,
  })
  portfoliosCreated: number;

  @ApiProperty({
    description: 'Number of sub-portfolios created',
    example: 12,
  })
  subPortfoliosCreated: number;

  @ApiProperty({
    description: 'Number of properties created',
    example: 25,
  })
  propertiesCreated: number;

  @ApiProperty({
    description: 'Number of property credentials created',
    example: 20,
  })
  credentialsCreated: number;

  @ApiProperty({
    description: 'List of created/existing portfolios',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  portfolios: any[];

  @ApiProperty({
    description: 'List of created/existing sub-portfolios',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        portfolio_id: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  subPortfolios: any[];

  @ApiProperty({
    description: 'List of created properties',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        portfolio_id: { type: 'string' },
        sub_portfolio_id: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  properties: any[];
}

export class ImportExpediaCredentialsFailureDto {
  @ApiProperty({ description: '1-based Excel row number (includes header row)' })
  row: number;

  @ApiPropertyOptional({
    description: 'Expedia ID from the row when parseable',
  })
  expediaId?: number;

  @ApiProperty({ description: 'Why this row was skipped or failed' })
  reason: string;
}

export class ImportExpediaCredentialsResponseDto {
  @ApiProperty({
    description:
      'Successful credential updates (one per property; a single Excel row can match multiple properties with the same Expedia ID)',
    example: 10,
  })
  updated: number;

  @ApiProperty({
    description: 'Rows whose Expedia ID did not match any property',
    example: 2,
  })
  propertyNotFound: number;

  @ApiProperty({
    description:
      'Rows skipped (missing/invalid Expedia ID, or both username and password empty)',
    example: 1,
  })
  rowsSkippedInvalid: number;

  @ApiProperty({
    description: 'Per-row issues (skipped or update errors)',
    type: [ImportExpediaCredentialsFailureDto],
  })
  failures: ImportExpediaCredentialsFailureDto[];
}
