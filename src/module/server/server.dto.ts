import { ApiProperty } from '@nestjs/swagger';
import {
  CreateServerType,
  UpdateServerType,
  BulkDeleteServerType,
} from './server.validation';

export class CreateServerDto implements CreateServerType {
  @ApiProperty({ description: 'Server name (unique)', example: 'Production Server 1' })
  name: string;

  @ApiProperty({ description: 'Server URL', example: 'https://server1.example.com' })
  url: string;

  @ApiProperty({ description: 'Is server active', default: true, required: false })
  is_active?: boolean;
}

export class UpdateServerDto implements UpdateServerType {
  @ApiProperty({ description: 'Server name (unique)', example: 'Production Server 1', required: false })
  name?: string;

  @ApiProperty({ description: 'Server URL', example: 'https://server1.example.com', required: false })
  url?: string;

  @ApiProperty({ description: 'Is server active', required: false })
  is_active?: boolean;
}

export class BulkDeleteServerDto implements BulkDeleteServerType {
  @ApiProperty({
    description: 'Array of server IDs to delete',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    type: [String],
  })
  ids: string[];
}

export class ServerResponseDto {
  @ApiProperty({ description: 'Server ID' })
  id: string;

  @ApiProperty({ description: 'Server name' })
  name: string;

  @ApiProperty({ description: 'Server URL' })
  url: string;

  @ApiProperty({ description: 'Current job count' })
  job_count: number;

  @ApiProperty({ description: 'Is server active' })
  is_active: boolean;

  @ApiProperty({ description: 'Created timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated timestamp' })
  updatedAt: Date;
}

export class ServerListResponseDto {
  @ApiProperty({ type: [ServerResponseDto] })
  servers: ServerResponseDto[];

  @ApiProperty({ description: 'Total number of servers' })
  totalDocuments: number;

  @ApiProperty({ description: 'Current page number' })
  currentPage: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPage: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;
}
