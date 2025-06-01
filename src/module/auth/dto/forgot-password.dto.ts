import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email address of the user who forgot their password',
  })
  email: string;
}

export class ValidateResetOtpDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email address of the user',
  })
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'OTP code received via email',
  })
  otp: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    example: 'reset_token_here',
    description: 'Reset token received from OTP validation',
  })
  resetToken: string;

  @ApiProperty({
    example: 'newPassword123',
    description: 'New password for the user',
  })
  newPassword: string;
}
