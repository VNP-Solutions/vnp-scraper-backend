import { ApiProperty } from '@nestjs/swagger';

export class DecryptAesGcmPayloadDto {
  @ApiProperty({
    description: 'Ciphertext as hex (AES-256-GCM)',
    example: '0bf7e3abb5cf4742ec0a368c2a',
  })
  encrypted: string;

  @ApiProperty({
    description: 'Initialization vector as hex (16 bytes)',
    example: '0eb305aac1ced677b0f22a1b78fd8194',
  })
  iv: string;

  @ApiProperty({
    description: 'GCM authentication tag as hex',
    example: 'e7d265f13a3d225d2e88b3e54400407d',
  })
  authTag: string;
}
