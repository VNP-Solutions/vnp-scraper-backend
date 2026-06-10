import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OTAProvider } from '@prisma/client';

export class CreateJobOtpDto {
  @ApiProperty({ example: '123456', description: 'OTP value' })
  otp: string;

  @ApiProperty({
    example: 'Expedia',
    enum: OTAProvider,
    description: 'OTA provider',
  })
  ota: OTAProvider;

  @ApiProperty({
    example: '65f0a3c4e2b7a1d2c3e4f5a6',
    description: 'Job ID',
  })
  job_id: string;
}

export class UpdateJobOtpDto {
  @ApiPropertyOptional({ example: '123456', description: 'OTP value' })
  otp?: string;

  @ApiPropertyOptional({
    example: 'Booking',
    enum: OTAProvider,
    description: 'OTA provider',
  })
  ota?: OTAProvider;

  @ApiPropertyOptional({
    example: '65f0a3c4e2b7a1d2c3e4f5a6',
    description: 'Job ID',
  })
  job_id?: string;
}
