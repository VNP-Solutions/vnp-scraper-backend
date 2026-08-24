import { ApiProperty } from '@nestjs/swagger';

export class CreatePhoneNumberSlotDto {
  @ApiProperty({ example: '+15551234567', description: 'Phone number' })
  phone_number: string;

  @ApiProperty({ example: 1, description: 'Slot index for this credential group / sheet row' })
  slot: number;
}

export class UpdatePhoneNumberSlotDto {
  @ApiProperty({ example: '+15559876543', description: 'Phone number' })
  phone_number: string;

  @ApiProperty({ example: 2, description: 'Slot index' })
  slot: number;
}

export class OccupiedPhoneNumberDto {
  @ApiProperty({ description: 'Phone number slot ID' })
  id: string;

  @ApiProperty({ example: '+15551234567', description: 'Phone number' })
  phone_number: string;

  @ApiProperty({ example: 1, description: 'Slot index' })
  slot: number;

  @ApiProperty({ example: 'Occupied', description: 'Status of the phone number slot' })
  status: string;

  @ApiProperty({ description: 'Job ID associated with this phone number', nullable: true })
  job_id: string | null;

  @ApiProperty({ description: 'Created at timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated at timestamp' })
  updatedAt: Date;
}

export class OccupiedPhoneNumbersResponseDto {
  @ApiProperty({ example: 5, description: 'Total count of occupied phone numbers' })
  total_occupied: number;

  @ApiProperty({ type: [OccupiedPhoneNumberDto], description: 'List of occupied phone numbers' })
  occupied_phone_numbers: OccupiedPhoneNumberDto[];
}
