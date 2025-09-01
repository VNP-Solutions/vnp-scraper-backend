import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OtpStatusValue } from '@prisma/client';

export class CreateOtpStatusDto {
  @ApiProperty({
    example: 'Occupied',
    description: 'OTP status value',
    enum: OtpStatusValue,
  })
  status: OtpStatusValue;

  @ApiProperty({
    example: '60d5ec49f8d2d0001f5a2b8c',
    description: 'Job ID associated with the OTP status',
  })
  job_id?: string;
}

export class UpdateOtpStatusDto {
  @ApiPropertyOptional({
    example: 'Released',
    description: 'OTP status value',
    enum: OtpStatusValue,
  })
  status?: OtpStatusValue;

  @ApiPropertyOptional({
    example: '60d5ec49f8d2d0001f5a2b8c',
    description: 'Job ID associated with the OTP status',
  })
  job_id?: string;
}
