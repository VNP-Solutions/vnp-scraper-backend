import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFileDto {
  @ApiProperty({
    example: 'https://s3-bucket.amazonaws.com/uploads/file.jpg',
    description: 'File URL in S3 bucket',
  })
  url: string;

  @ApiProperty({
    example: 'profile-picture.jpg',
    description: 'Original name of the uploaded file',
  })
  originalName: string;

  @ApiPropertyOptional({
    example: '507f1f77bcf86cd799439011',
    description: 'ID of the property this file belongs to',
  })
  property_id?: string;
}

export class UpdateFileDto {
  @ApiPropertyOptional({
    example: 'https://s3-bucket.amazonaws.com/uploads/updated-file.jpg',
    description: 'Updated file URL in S3 bucket',
  })
  url?: string;

  @ApiPropertyOptional({
    example: 'updated-profile-picture.jpg',
    description: 'Updated original name of the file',
  })
  originalName?: string;

  @ApiPropertyOptional({
    example: '507f1f77bcf86cd799439011',
    description: 'Updated property ID this file belongs to',
  })
  property_id?: string;
}