import { ApiProperty } from '@nestjs/swagger';

export class CreateOnboardingDto {
  @ApiProperty({ example: 'Jane Doe', description: 'Contact name' })
  name: string;

  @ApiProperty({ example: 'Acme Hotels', description: 'Company name' })
  company: string;

  @ApiProperty({ example: 'jane@acme.com', description: 'Contact email' })
  email: string;

  @ApiProperty({ example: '+1 555 0100', description: 'Contact phone' })
  phone: string;

  @ApiProperty({
    example: 5,
    description: 'Number of hotels',
    minimum: 1,
  })
  number_of_hotels: number;
}
