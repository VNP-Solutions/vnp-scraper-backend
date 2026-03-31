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
