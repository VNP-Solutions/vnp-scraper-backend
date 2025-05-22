import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserFeatureAccessPermissionDto {
  @ApiProperty({
    description: 'User ID',
    example: '507f1f77bcf86cd799439011',
  })
  user_id: string;

  @ApiPropertyOptional({
    description: 'Portfolio ID',
    example: '507f1f77bcf86cd799439011',
  })
  portfolio_id?: string;

  @ApiPropertyOptional({
    description: 'Sub Portfolio ID',
    example: '507f1f77bcf86cd799439011',
  })
  sub_portfolio_id?: string;

  @ApiPropertyOptional({
    description: 'Property ID',
    example: '507f1f77bcf86cd799439011',
  })
  property_id?: string;
}

export class UpdateUserFeatureAccessPermissionDto {
  @ApiPropertyOptional({
    description: 'Portfolio ID',
    example: '507f1f77bcf86cd799439011',
  })
  portfolio_id?: string;

  @ApiPropertyOptional({
    description: 'Sub Portfolio ID',
    example: '507f1f77bcf86cd799439011',
  })
  sub_portfolio_id?: string;

  @ApiPropertyOptional({
    description: 'Property ID',
    example: '507f1f77bcf86cd799439011',
  })
  property_id?: string;
}
