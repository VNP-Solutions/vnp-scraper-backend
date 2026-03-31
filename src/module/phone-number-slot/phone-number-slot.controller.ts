import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreatePhoneNumberSlotDto,
  UpdatePhoneNumberSlotDto,
} from './phone-number-slot.dto';
import { IPhoneNumberSlotService } from './phone-number-slot.interface';
import {
  createPhoneNumberSlotSchema,
  updatePhoneNumberSlotSchema,
} from './phone-number-slot.validation';

@ApiTags('Phone number slots')
@ApiBearerAuth('JWT-auth')
@Controller('/phone-number-slots')
@UseGuards(JwtAuthGuard)
export class PhoneNumberSlotController {
  constructor(
    @Inject('IPhoneNumberSlotService')
    private readonly phoneNumberSlotService: IPhoneNumberSlotService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Add a phone number slot',
    description:
      'Creates a row with phone_number and slot. status defaults to Released; job_id is null.',
  })
  @ApiResponse({ status: 201, description: 'Created' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({
    status: 409,
    description: 'Same slot + same last 3 digits already exists',
  })
  @ValidateBody(createPhoneNumberSlotSchema)
  async create(
    @Body() dto: CreatePhoneNumberSlotDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const data = await this.phoneNumberSlotService.create(dto);
        return {
          statusCode: 201,
          message: 'Phone number slot created successfully',
          data,
        };
      },
      this.logger,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all phone number slots' })
  @ApiResponse({ status: 200, description: 'List of phone number slots' })
  async findAll(@Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const data = await this.phoneNumberSlotService.findAll();
        return {
          statusCode: 200,
          message: 'Phone number slots retrieved successfully',
          data,
        };
      },
      this.logger,
    );
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update phone number and slot',
    description: 'Updates phone_number and slot only; status and job_id unchanged.',
  })
  @ApiParam({ name: 'id', description: 'PhoneNumberSlot document id' })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({
    status: 409,
    description: 'Same slot + same last 3 digits already exists on another row',
  })
  @ValidateBody(updatePhoneNumberSlotSchema)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePhoneNumberSlotDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const data = await this.phoneNumberSlotService.update(id, dto);
        return {
          statusCode: 200,
          message: 'Phone number slot updated successfully',
          data,
        };
      },
      this.logger,
    );
  }
}
