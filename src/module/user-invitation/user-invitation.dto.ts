import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvitationStatus, RoleEnum } from '@prisma/client';

export class CreateInvitationDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'Email address of the user to invite',
  })
  email: string;

  @ApiProperty({
    enum: RoleEnum,
    example: RoleEnum.partial,
    description:
      'Role to assign to the invited user. If "admin", permission arrays below will be ignored as admins have full access.',
  })
  role: RoleEnum;

  @ApiPropertyOptional({
    example: 'Welcome to the VNP Dashboard! Please join our team.',
    description: 'Optional message to include in the invitation email',
  })
  message?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    description:
      'Array of portfolio IDs the user should have access to (only for partial role, ignored for admin role)',
  })
  portfolio_ids?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['507f1f77bcf86cd799439013', '507f1f77bcf86cd799439014'],
    description:
      'Array of sub-portfolio IDs the user should have access to (only for partial role, ignored for admin role)',
  })
  sub_portfolio_ids?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['507f1f77bcf86cd799439015', '507f1f77bcf86cd799439016'],
    description:
      'Array of property IDs the user should have access to (only for partial role, ignored for admin role)',
  })
  property_ids?: string[];
}

export class AcceptInvitationDto {
  @ApiProperty({
    example: 'John Doe',
    description: 'Full name of the user accepting the invitation',
  })
  name: string;

  @ApiProperty({
    example: 'password123',
    description: 'Password for the new user account',
  })
  password: string;

  @ApiPropertyOptional({
    example: '+1234567890',
    description: 'Phone number of the user',
  })
  phone_number?: string;
}

export class UpdateInvitationDto {
  @ApiPropertyOptional({
    enum: InvitationStatus,
    example: InvitationStatus.Cancelled,
    description: 'Status of the invitation',
  })
  status?: InvitationStatus;

  @ApiPropertyOptional({
    enum: RoleEnum,
    example: RoleEnum.admin,
    description:
      'Role to assign to the invited user. If changed to "admin", permission arrays will be cleared as admins have full access.',
  })
  role?: RoleEnum;

  @ApiPropertyOptional({
    example: 'Updated invitation message',
    description: 'Message to include in the invitation',
  })
  message?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    description:
      'Array of portfolio IDs the user should have access to (only for partial role, cleared if role is admin)',
  })
  portfolio_ids?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['507f1f77bcf86cd799439013', '507f1f77bcf86cd799439014'],
    description:
      'Array of sub-portfolio IDs the user should have access to (only for partial role, cleared if role is admin)',
  })
  sub_portfolio_ids?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['507f1f77bcf86cd799439015', '507f1f77bcf86cd799439016'],
    description:
      'Array of property IDs the user should have access to (only for partial role, cleared if role is admin)',
  })
  property_ids?: string[];
}

export class ResendInvitationDto {
  @ApiPropertyOptional({
    example: 'We hope you can join our team soon!',
    description: 'Updated message for the resent invitation',
  })
  message?: string;
}
