import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OTAProvider } from '@prisma/client';

export class CreateOtpCodeDto {
  @ApiProperty({
    example: 'Expedia',
    description: 'OTA the OTP code came from',
    enum: OTAProvider,
  })
  provider: OTAProvider;

  @ApiProperty({
    example: '123456',
    description: '6-digit numeric OTP code',
    pattern: '^\\d{6}$',
  })
  otp_code: string;

  @ApiPropertyOptional({
    example: '60d5ec49f8d2d0001f5a2b8c',
    description: 'Job ID that triggered this OTP request, if any',
  })
  job_id?: string;
}
