import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CreateAgodaCaseItemNoteType,
  UpdateAgodaCaseItemNoteType,
} from './agoda-case-item-note.validation';

export class CreateAgodaCaseItemNoteDto
  implements CreateAgodaCaseItemNoteType
{
  @ApiProperty({
    description: 'Note text',
    example: 'Called Agoda Partner Support, they asked us to resubmit the case with the folio attached.',
  })
  note: string;
}

export class UpdateAgodaCaseItemNoteDto
  implements UpdateAgodaCaseItemNoteType
{
  @ApiProperty({
    description: 'Updated note text',
    example: 'Resubmitted the case with the folio attached — waiting on a reply.',
  })
  note: string;
}

/** Just enough of the author to show "who wrote this" without exposing the full User record. */
export class AgodaCaseItemNoteAuthorDto {
  @ApiProperty({ description: 'User ID' })
  id: string;

  @ApiProperty({ description: 'User name' })
  name: string;

  @ApiProperty({ description: 'User email' })
  email: string;
}

export class AgodaCaseItemNoteResponseDto {
  @ApiProperty({ description: 'Note ID' })
  id: string;

  @ApiProperty({ description: 'Agoda case item this note belongs to' })
  agoda_case_item_id: string;

  @ApiProperty({ description: 'Note text' })
  note: string;

  @ApiProperty({
    description:
      'When the note was taken — fixed at creation, never changes even if the note is later edited',
  })
  note_time: Date;

  @ApiProperty({ description: 'MongoDB ObjectId of the user who wrote this note' })
  createdBy: string;

  @ApiPropertyOptional({
    description: 'The user who wrote this note',
    type: AgodaCaseItemNoteAuthorDto,
  })
  creator?: AgodaCaseItemNoteAuthorDto;

  @ApiProperty({ description: 'Created timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last edited timestamp' })
  updatedAt: Date;
}
