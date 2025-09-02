import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreatePropertyCredentialsDto {
  @ApiPropertyOptional({
    description: 'Expedia username',
  })
  expediaUsername?: string;

  @ApiPropertyOptional({
    description: 'Expedia password',
  })
  expediaPassword?: string;

  @ApiPropertyOptional({
    description: 'Agoda username',
  })
  agodaUsername?: string;

  @ApiPropertyOptional({
    description: 'Agoda password',
  })
  agodaPassword?: string;

  @ApiPropertyOptional({
    description: 'Booking.com username',
  })
  bookingUsername?: string;

  @ApiPropertyOptional({
    description: 'Booking.com password',
  })
  bookingPassword?: string;

  @ApiPropertyOptional({
    description: 'Expedia email associated with the account',
  })
  expediaEmailAssociated?: string;

  @ApiPropertyOptional({
    description: 'Property contact email',
  })
  propertyContactEmail?: string;

  @ApiPropertyOptional({
    description: 'Portfolio contact email',
  })
  portfolioContactEmail?: string;

  @ApiPropertyOptional({
    description: 'Multiple portfolio emails',
    type: [String],
  })
  multiplePortfolioEmails?: string[];

  @ApiProperty({
    description: 'Property id',
  })
  property_id: string;
}

export class UpdatePropertyCredentialsDto extends PartialType(
  CreatePropertyCredentialsDto,
) {}

export class BulkUpdatePropertyCredentialsDto {
  @ApiProperty({
    description: 'Array of property IDs to apply credentials to',
    type: [String],
    example: ['property-1', 'property-2', 'property-3'],
  })
  propertyIds: string[];

  @ApiProperty({
    description: 'Credentials to apply to all properties',
    type: UpdatePropertyCredentialsDto,
  })
  credentials: UpdatePropertyCredentialsDto;
}
