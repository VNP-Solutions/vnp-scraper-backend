import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class DateRangeDto {
  @ApiPropertyOptional({ example: '01/01/2024' })
  start_date?: string;

  @ApiPropertyOptional({ example: '01/31/2024' })
  end_date?: string;
}

class JobSummaryDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  property_name?: string;

  @ApiPropertyOptional()
  job_status?: string;

  @ApiPropertyOptional()
  portfolio_name?: string;

  @ApiPropertyOptional()
  sub_portfolio_name?: string;
}

export class DbDataResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  job_id: string;

  @ApiProperty()
  property_name: string;

  @ApiProperty()
  property_id: string;

  @ApiPropertyOptional({ type: DateRangeDto })
  date_range?: DateRangeDto;

  @ApiProperty({ type: [String], default: [] })
  reservation_ids: string[];

  @ApiProperty({ type: [String], default: [] })
  gearbox_queue_ids: string[];

  @ApiPropertyOptional()
  total_invoice_amount?: number;

  @ApiPropertyOptional()
  total_invoice_amount_currency?: string;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiPropertyOptional({ type: JobSummaryDto })
  job?: JobSummaryDto;
}
