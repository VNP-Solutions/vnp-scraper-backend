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
  _id?: string;
  name: string;
}

export class SyncUpdatePortfolioDto {
  oldName: string;
  newName: string;
}

export class SyncDeletePortfolioDto {
  name: string;
}

export class SyncUpsertPortfolioDto {
  @ApiProperty({ example: 'Main Portfolio', description: 'Portfolio name' })
  name: string;
}

export class SyncDeleteByParentPortfolioDto {
  @ApiProperty({
    example: 'dbms-portfolio-123',
    description: 'DBMS portfolio id (delete key)',
  })
  parent_id: string;
}

export class SyncBulkUpsertPortfolioItemDto {
  @ApiProperty({
    example: 2,
    description: 'Source row number for the sync report',
  })
  row: number;

  @ApiProperty({
    example: 'dbms-portfolio-123',
    description: 'DBMS portfolio id (upsert key)',
  })
  parent_id: string;

  @ApiProperty({
    example: 'Luxury Hotels Portfolio',
    description: 'Portfolio name',
  })
  name: string;
}

export class SyncBulkUpsertPortfolioDto {
  @ApiProperty({ type: [SyncBulkUpsertPortfolioItemDto] })
  items: SyncBulkUpsertPortfolioItemDto[];
}

export class SyncBulkUpsertPortfolioResultDto {
  @ApiProperty({ example: 10 }) totalRows: number;
  @ApiProperty({ example: 4 }) createdCount: number;
  @ApiProperty({ example: 4 }) updatedCount: number;
  @ApiProperty({ example: 2 }) failureCount: number;
  @ApiProperty() errors: Array<{
    row: number;
    parent_id: string;
    error: string;
  }>;
  @ApiProperty() successfulUpserts: Array<{
    parent_id: string;
    action: 'created' | 'updated';
  }>;
}
