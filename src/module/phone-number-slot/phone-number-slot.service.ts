import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PhoneNumberSlot, Prisma } from '@prisma/client';
import {
  CreatePhoneNumberSlotDto,
  UpdatePhoneNumberSlotDto,
} from './phone-number-slot.dto';
import {
  IPhoneNumberSlotRepository,
  IPhoneNumberSlotService,
} from './phone-number-slot.interface';
import { getPhoneLastThreeDigitsKey } from './phone-number-slot.utils';

@Injectable()
export class PhoneNumberSlotService implements IPhoneNumberSlotService {
  constructor(
    @Inject('IPhoneNumberSlotRepository')
    private readonly repository: IPhoneNumberSlotRepository,
    private readonly logger: Logger,
  ) {}

  private assertHasDigitKey(phone_number: string): string {
    const key = getPhoneLastThreeDigitsKey(phone_number);
    if (!key) {
      throw new BadRequestException(
        'phone_number must contain at least one digit',
      );
    }
    return key;
  }

  private async assertUniqueLastThreeDigitsAndSlot(
    phone_number: string,
    slot: number,
    excludeId?: string,
  ): Promise<void> {
    const key = this.assertHasDigitKey(phone_number);
    const rows = await this.repository.findBySlot(slot);
    const conflict = rows.some(
      (r) =>
        (excludeId === undefined || r.id !== excludeId) &&
        getPhoneLastThreeDigitsKey(r.phone_number) === key,
    );
    if (conflict) {
      throw new ConflictException(
        `Duplicate: slot ${slot} already has a number with the same last 3 digits (${key})`,
      );
    }
  }

  async create(data: CreatePhoneNumberSlotDto): Promise<PhoneNumberSlot> {
    try {
      await this.assertUniqueLastThreeDigitsAndSlot(
        data.phone_number,
        data.slot,
      );
      return await this.repository.create(data);
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Error creating phone number slot: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findAll(): Promise<PhoneNumberSlot[]> {
    try {
      return await this.repository.findAll();
    } catch (error) {
      this.logger.error(
        `Error listing phone number slots: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async update(
    id: string,
    data: UpdatePhoneNumberSlotDto,
  ): Promise<PhoneNumberSlot> {
    try {
      await this.assertUniqueLastThreeDigitsAndSlot(
        data.phone_number,
        data.slot,
        id,
      );
      return await this.repository.update(id, data);
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Phone number slot ${id} not found`);
      }
      this.logger.error(
        `Error updating phone number slot: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
