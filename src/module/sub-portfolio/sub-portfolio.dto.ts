import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubPortfolioDto {
  @ApiProperty({
    example: 'Tech Stocks',
    description: 'Name of the sub-portfolio',
  })
  name: string;

  @ApiPropertyOptional({
    example: 'A collection of technology sector stocks',
    description: 'Description of the sub-portfolio',
  })
  description?: string;

  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'ID of the parent portfolio',
  })
  portfolio_id: string;
}

export class UpdateSubPortfolioDto {
  @ApiPropertyOptional({
    example: 'Tech Stocks',
    description: 'Name of the sub-portfolio',
  })
  name?: string;

  @ApiPropertyOptional({
    example: 'A collection of technology sector stocks',
    description: 'Description of the sub-portfolio',
  })
  description?: string;

  @ApiPropertyOptional({
    example: '507f1f77bcf86cd799439011',
    description: 'ID of the parent portfolio',
  })
  portfolio_id?: string;
}