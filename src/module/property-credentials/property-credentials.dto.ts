import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';

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

  @ApiPropertyOptional({
    description: 'Property id',
  })
  propertyId?: string;
}

export class UpdatePropertyCredentialsDto extends PartialType(
  CreatePropertyCredentialsDto,
) {}
