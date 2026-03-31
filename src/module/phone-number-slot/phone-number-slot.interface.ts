import { PhoneNumberSlot } from '@prisma/client';
import {
  CreatePhoneNumberSlotDto,
  UpdatePhoneNumberSlotDto,
} from './phone-number-slot.dto';

export interface IPhoneNumberSlotRepository {
  create(data: CreatePhoneNumberSlotDto): Promise<PhoneNumberSlot>;
  findAll(): Promise<PhoneNumberSlot[]>;
  findBySlot(slot: number): Promise<PhoneNumberSlot[]>;
  update(id: string, data: UpdatePhoneNumberSlotDto): Promise<PhoneNumberSlot>;
}

export interface IPhoneNumberSlotService {
  create(data: CreatePhoneNumberSlotDto): Promise<PhoneNumberSlot>;
  findAll(): Promise<PhoneNumberSlot[]>;
  update(id: string, data: UpdatePhoneNumberSlotDto): Promise<PhoneNumberSlot>;
}
