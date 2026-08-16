import { Body, Controller, Logger, Post, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DecryptAesGcmPayloadDto } from './decrypt-payload.dto';

@ApiTags('Encryption')
@ApiBearerAuth('JWT-auth')
@Controller('encryption')
export class EncryptionController {
  constructor(
    private readonly encryptionUtil: EncryptionUtil,
    private readonly logger: Logger,
  ) {}

  @Post('decrypt')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Decrypt AES-256-GCM payload',
    description:
      'Decrypts a value produced by the app’s AES-256-GCM helpers using ENCRYPTION_KEY. Body must use hex strings for encrypted, iv, and authTag.',
  })
  @ApiBody({ type: DecryptAesGcmPayloadDto })
  @ApiResponse({
    status: 200,
    description: 'Plaintext in data.decrypted',
    schema: {
      example: {
        statusCode: 200,
        message: 'Decrypted successfully',
        data: { decrypted: 'your-plaintext' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid payload or decryption failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async decrypt(@Body() body: DecryptAesGcmPayloadDto, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        try {
          const decrypted = this.encryptionUtil.decrypt({
            encrypted: body.encrypted,
            iv: body.iv,
            authTag: body.authTag,
          });
          return {
            statusCode: 200,
            message: 'Decrypted successfully',
            data: { decrypted },
          };
        } catch (error) {
          return {
            statusCode: 400,
            message:
              error instanceof Error
                ? error.message
                : 'Decryption failed. Ensure hex encoding and that ciphertext was produced with this server’s ENCRYPTION_KEY.',
            data: null,
          };
        }
      },
      this.logger,
    );
  }
}
