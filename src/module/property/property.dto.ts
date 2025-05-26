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
  expediaId?: number;

  @ApiPropertyOptional({
    description: 'Expedia Status',
  })
  expediaStatus?: string;

  @ApiPropertyOptional({
    description: 'Booking.com ID',
  })
  bookingId?: number;

  @ApiPropertyOptional({
    description: 'Booking.com Status',
  })
  bookingStatus?: string;

  @ApiPropertyOptional({
    description: 'Agoda ID',
  })
  agodaId?: number;

  @ApiPropertyOptional({
    description: 'Agoda Status',
  })
  agodaStatus?: string;
}

export class UpdatePropertyDto extends CreatePropertyDto {}
