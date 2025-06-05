import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleEnum } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'User email address',
  })
  email: string;

  @ApiProperty({ example: 'password123', description: 'User password' })
  password: string;

  @ApiProperty({ example: 'John Doe', description: 'User full name' })
  name: string;

  @ApiProperty({
    enum: RoleEnum,
    example: RoleEnum.admin,
    description: 'User role',
  })
  role: RoleEnum;

  @ApiPropertyOptional({
    example: 'profile.jpg',
    description: 'User profile image',
  })
  image?: string;

  @ApiPropertyOptional({
    example: '+1234567890',
    description: 'User phone number',
  })
  phone_number?: string;

  @ApiPropertyOptional({
    example: '507f1f77bcf86cd799439011',
    description: 'ID of the user who invited this user',
  })
  invited_user_id?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'User verification status',
  })
  is_verified?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'User MFA status',
  })
  mfa_enabled?: boolean;

  @ApiPropertyOptional({
    example: '1234567890',
    description: 'User MFA secret',
  })
  mfa_secret?: string;

  @ApiPropertyOptional({
    example: '2024-01-01T00:00:00.000Z',
    description: 'User last login date',
  })
  last_login?: Date;
}

export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'john@example.com',
    description: 'User email address',
  })
  email?: string;

  @ApiPropertyOptional({ example: 'password123', description: 'User password' })
  password?: string;

  @ApiPropertyOptional({ example: 'John Doe', description: 'User full name' })
  name?: string;

  @ApiPropertyOptional({
    enum: RoleEnum,
    example: RoleEnum.admin,
    description: 'User role',
  })
  role?: RoleEnum;

  @ApiPropertyOptional({
    example: 'profile.jpg',
    description: 'User profile image',
  })
  image?: string;

  @ApiPropertyOptional({
    example: '+1234567890',
    description: 'User phone number',
  })
  phone_number?: string;

  @ApiPropertyOptional({
    example: '507f1f77bcf86cd799439011',
    description: 'ID of the user who invited this user',
  })
  invited_user_id?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'User verification status',
  })
  is_verified?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'User download report permission',
  })
  download_report?: boolean;
}
