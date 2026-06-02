import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNoteDto {
  @ApiProperty({ example: 'This onboarding looks promising.', description: 'Note comment text' })
  comment: string;

  @ApiProperty({ example: '665f1a2b3c4d5e6f7a8b9c0e', description: 'Onboarding ID (ObjectId)' })
  onboarding_id: string;

  user_id?: string;
}

export class UpdateNoteDto {
  @ApiPropertyOptional({ example: 'Updated comment text.', description: 'Updated note comment' })
  comment: string;
}
