import { Injectable } from '@nestjs/common';
import { PhoneNumberSlot, PhoneNumberSlotStatus } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import {
  CreatePhoneNumberSlotDto,
  UpdatePhoneNumberSlotDto,
} from './phone-number-slot.dto';
import { IPhoneNumberSlotRepository } from './phone-number-slot.interface';

@Injectable()
export class PhoneNumberSlotRepository implements IPhoneNumberSlotRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(data: CreatePhoneNumberSlotDto): Promise<PhoneNumberSlot> {
    return this.db.phoneNumberSlot.create({
      data: {
        phone_number: data.phone_number,
        slot: data.slot,
        status: PhoneNumberSlotStatus.Released,
        job_id: null,
      },
    });
  }

  async findAll(): Promise<PhoneNumberSlot[]> {
    return this.db.phoneNumberSlot.findMany({
      orderBy: [{ slot: 'asc' }, { phone_number: 'asc' }],
    });
  }

  async findBySlot(slot: number): Promise<PhoneNumberSlot[]> {
    return this.db.phoneNumberSlot.findMany({
      where: { slot },
    });
  }

  async findOccupied(): Promise<PhoneNumberSlot[]> {
    return this.db.phoneNumberSlot.findMany({
      where: { status: PhoneNumberSlotStatus.Occupied },
      orderBy: [{ slot: 'asc' }, { phone_number: 'asc' }],
    });
  }

  async update(
    id: string,
    data: UpdatePhoneNumberSlotDto,
  ): Promise<PhoneNumberSlot> {
    return this.db.phoneNumberSlot.update({
      where: { id },
      data: {
        phone_number: data.phone_number,
        slot: data.slot,
      },
    });
  }
}
