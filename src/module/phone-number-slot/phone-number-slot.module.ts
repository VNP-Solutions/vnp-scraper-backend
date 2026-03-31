import { Logger, Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PhoneNumberSlotController } from './phone-number-slot.controller';
import { PhoneNumberSlotRepository } from './phone-number-slot.repository';
import { PhoneNumberSlotService } from './phone-number-slot.service';

@Module({
  imports: [],
  controllers: [PhoneNumberSlotController],
  providers: [
    {
      provide: 'IPhoneNumberSlotService',
      useClass: PhoneNumberSlotService,
    },
    {
      provide: 'IPhoneNumberSlotRepository',
      useClass: PhoneNumberSlotRepository,
    },
    DatabaseService,
    Logger,
  ],
  exports: ['IPhoneNumberSlotService', 'IPhoneNumberSlotRepository'],
})
export class PhoneNumberSlotModule {}
