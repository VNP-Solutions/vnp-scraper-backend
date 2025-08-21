import { ApiProperty } from '@nestjs/swagger';
export class HealthResponseDto {
  @ApiProperty({ example: 'Connection established' })
  messge: string;
}
export class ErrorResponseDto {
  @ApiProperty({ example: 500 })
  status: number;
  @ApiProperty({ example: 'Server error' })
  message: string;
  @ApiProperty({ example: 'Detailed error message', required: false })
  error?: string;
}
export class ScrapingStateDto {
  @ApiProperty({ example: 'running' })
  state: string;
  @ApiProperty({ example: 50 })
  progress: number;
}
export class ScrapingStatusResponseDto {
  @ApiProperty({ example: 200 })
  status: number;
  @ApiProperty({ example: 'Scraping status retrieved successfully' })
  message: string;
  @ApiProperty({ type: ScrapingStateDto })
  data: ScrapingStateDto;
}
export class PauseResumeStopResponseDto {
  @ApiProperty({ example: 200 })
  status: number;
  @ApiProperty({ example: 'Scraping paused successfully' })
  message: string;
  @ApiProperty({ type: ScrapingStateDto, required: false })
  data?: ScrapingStateDto;
}

export class AllJobItemsResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;
  @ApiProperty({ description: 'Response message' })
  message: string;
  @ApiProperty({ description: 'Array of job items', type: 'array' })
  data: any[];
  @ApiProperty({
    description: 'Response metadata',
    example: { total: 25, jobId: '507f1f77bcf86cd799439011' },
  })
  metadata: {
    total: number;
    jobId: string;
  };
}