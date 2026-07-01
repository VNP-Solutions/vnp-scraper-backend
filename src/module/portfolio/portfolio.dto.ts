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
  _id: string;
  name: string;
}

export class SyncUpdatePortfolioDto {
  _id: string;
  oldName: string;
  name?: string;
}

export class SyncDeletePortfolioDto {
  _id: string;
  name: string;
}
