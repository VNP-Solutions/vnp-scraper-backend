import { Logger, Module } from '@nestjs/common';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import { EncryptionController } from './encryption.controller';

@Module({
  controllers: [EncryptionController],
  providers: [EncryptionUtil, Logger],
})
export class EncryptionModule {}
