import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePortfolioDto {
  @ApiProperty({
    example: 'Main Portfolio',
    description: 'Portfolio name',
  })
  name: string;
}

export class UpdatePortfolioDto {
  @ApiPropertyOptional({
    example: 'Updated Portfolio Name',
    description: 'Portfolio name',
  })
  name: string;
}

export class SyncCreatePortfolioDto {
  name: string;
}

export class SyncUpdatePortfolioDto {
  oldName: string;
  newName: string;
}

export class SyncDeletePortfolioDto {
  name: string;
}