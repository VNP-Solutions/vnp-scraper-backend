import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OTAProvider } from '@prisma/client';

export class CreatePropertyDto {
  @ApiProperty({
    description: 'Property name',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Parent property ID',
  })
  parent_id?: string;

  @ApiPropertyOptional({
    description: 'Portfolio ID',
  })
  portfolio_id?: string;

  @ApiPropertyOptional({
    description: 'Sub Portfolio ID',
  })
  sub_portfolio_id?: string;

  @ApiPropertyOptional({ description: 'Portfolio name (for sync resolution)' })
  portfolio_name?: string;
  
  @ApiPropertyOptional({ description: 'Sub Portfolio name (for sync resolution)' })
  sub_portfolio_name?: string;

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
    description: 'Parent property ID',
  })
  parent_id?: string;

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

export class UpdateOtaCredentialsDto {
  @ApiProperty({
    description: 'Mongo ObjectId of the property',
    example: '507f1f77bcf86cd799439011',
  })
  property_id: string;

  @ApiProperty({ enum: OTAProvider })
  ota_provider: OTAProvider;

  @ApiPropertyOptional({
    description: 'Login username for that OTA on property_credentials',
  })
  username?: string;

  @ApiPropertyOptional({
    description: 'Login password for that OTA (stored encrypted)',
  })
  password?: string;
}

export class UpdateOtaCredentialsFailureDto {
  @ApiPropertyOptional({
    description: 'Property id when a per-property credential update failed',
  })
  property_id?: string;

  @ApiProperty({ description: 'Error detail' })
  reason: string;
}

export class UpdateOtaCredentialsResponseDto {
  @ApiProperty({
    description: '1 if credentials were updated, 0 otherwise',
    example: 1,
  })
  updated: number;

  @ApiProperty({
    description: 'True when no property exists with the given property_id',
    example: false,
  })
  propertyNotFound: boolean;

  @ApiProperty({
    description: 'Per-property update errors (empty when all succeeded)',
    type: [UpdateOtaCredentialsFailureDto],
  })
  failures: UpdateOtaCredentialsFailureDto[];
}

export class RevealOtaCredentialsDto {
  @ApiProperty({
    description: 'Mongo ObjectId of the property',
    example: '507f1f77bcf86cd799439011',
  })
  property_id: string;

  @ApiProperty({ enum: OTAProvider })
  ota_provider: OTAProvider;
}

export class RevealOtaCredentialsResponseDto {
  @ApiProperty({
    description: 'True when no property exists with the given property_id',
  })
  propertyNotFound: boolean;

  @ApiProperty({
    description:
      'True when the property exists but has no property_credentials row yet',
  })
  credentialsNotFound: boolean;

  @ApiProperty({
    description: 'Plaintext username for the requested OTA (empty if unset)',
  })
  username: string;

  @ApiProperty({
    description:
      'Decrypted password for the requested OTA (empty if unset or decryption failed)',
  })
  password: string;
}

export class SyncUpsertPropertyDto {
  @ApiProperty({ example: 'dbms-portfolio-123', description: 'DBMS portfolio id (resolves portfolio)' })
  portfolio_parent_id: string;

  @ApiProperty({ example: 'Grand Hotel', description: 'Property name' })
  name: string;

  @ApiPropertyOptional({ example: 123456 }) expedia_id?: number;
  @ApiPropertyOptional({ example: 654321 }) booking_id?: number;
  @ApiPropertyOptional({ example: 111222 }) agoda_id?: number;

  @ApiPropertyOptional() expedia_username?: string;
  @ApiPropertyOptional() expedia_password?: string;
  @ApiPropertyOptional() agoda_username?: string;
  @ApiPropertyOptional() agoda_password?: string;
  @ApiPropertyOptional() booking_username?: string;
  @ApiPropertyOptional() booking_password?: string;
}

export class SyncBulkUpsertPropertyItemDto {
  @ApiProperty({ example: 2, description: 'Source row number for the sync report' })
  row: number;

  @ApiProperty({ example: 'dbms-property-123', description: 'DBMS property id (upsert key)' })
  parent_id: string;

  @ApiProperty({ example: 'dbms-portfolio-123', description: 'DBMS portfolio id (resolves portfolio)' })
  portfolio_parent_id: string;

  @ApiProperty({ example: 'Grand Hotel', description: 'Property name' })
  name: string;

  @ApiPropertyOptional({ example: 123456 }) expedia_id?: number;
  @ApiPropertyOptional({ example: 654321 }) booking_id?: number;
  @ApiPropertyOptional({ example: 111222 }) agoda_id?: number;

  @ApiPropertyOptional() expedia_username?: string;
  @ApiPropertyOptional() expedia_password?: string;
  @ApiPropertyOptional() agoda_username?: string;
  @ApiPropertyOptional() agoda_password?: string;
  @ApiPropertyOptional() booking_username?: string;
  @ApiPropertyOptional() booking_password?: string;
}

export class SyncBulkUpsertPropertyResultDto {
  @ApiProperty({ example: 10 }) totalRows: number;
  @ApiProperty({ example: 4 }) createdCount: number;
  @ApiProperty({ example: 4 }) updatedCount: number;
  @ApiProperty({ example: 2 }) failureCount: number;
  @ApiProperty() errors: Array<{ row: number; parent_id: string; error: string }>;
  @ApiProperty() successfulUpserts: Array<{ parent_id: string; action: 'created' | 'updated' }>;
}

export class SyncDeleteDto {
  expedia_id?: number | null;
  booking_id?: number | null;
  agoda_id?: number | null;
}

export class SyncBulkCreateDto {
  items: CreatePropertyDto[];
}

export class SyncBulkDeletePropertyItemDto {
  @ApiProperty({ example: 'dbms-property-123', description: 'DBMS property id (delete key)' })
  parent_id: string;
}

export class SyncBulkDeleteDto {
  @ApiProperty({ type: [SyncBulkDeletePropertyItemDto] })
  items: SyncBulkDeletePropertyItemDto[];
}

export class SyncBulkDeletePropertyResultDto {
  @ApiProperty({ example: 2 }) totalCount: number;
  @ApiProperty({ example: 1 }) deletedCount: number;
  @ApiProperty({ example: 1 }) failureCount: number;
  @ApiProperty() errors: Array<{ parent_id: string; error: string }>;
  @ApiProperty() successfulDeletes: Array<{ parent_id: string }>;
}