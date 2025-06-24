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

  @ApiProperty({
    description: 'User email for property access',
    example: 'user@example.com',
  })
  user_email: string;

  @ApiProperty({
    description: 'User password for property access (will be encrypted)',
    example: 'securePassword123',
  })
  user_password: string;
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
    description: 'User email for property access',
    example: 'user@example.com',
  })
  user_email?: string;

  @ApiPropertyOptional({
    description: 'User password for property access (will be encrypted)',
    example: 'securePassword123',
  })
  user_password?: string;
}
