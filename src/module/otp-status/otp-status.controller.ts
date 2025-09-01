import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { CreateOtpStatusDto, UpdateOtpStatusDto } from './otp-status.dto';
import { IOtpStatusService } from './otp-status.interface';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  createOtpStatusSchema,
  updateOtpStatusSchema,
} from './otp-status.validation';

@ApiTags('OTP Status')
@ApiBearerAuth('JWT-auth')
@Controller('/otp-status')
export class OtpStatusController {
  constructor(
    @Inject('IOtpStatusService')
    private readonly otpStatusService: IOtpStatusService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new OTP status' })
  @ApiResponse({ status: 201, description: 'OTP status created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ValidateBody(createOtpStatusSchema)
  @UseGuards(JwtAuthGuard)
  async createOtpStatus(
    @Req() request: Request,
    @Body() createOtpStatusDto: CreateOtpStatusDto,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to create an OTP status',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      response,
      async () => {
        const res =
          await this.otpStatusService.createOtpStatus(createOtpStatusDto);
        return {
          statusCode: 200,
          message: 'OTP status created successfully',
          data: res,
        };
      },
      this.logger,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get OTP status by ID' })
  @ApiResponse({ status: 200, description: 'Returns an OTP status' })
  @ApiResponse({ status: 404, description: 'OTP status not found' })
  async getOtpStatusById(@Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const otpStatus = await this.otpStatusService.getOtpStatus();
        return {
          statusCode: 200,
          message: 'OTP status retrieved successfully',
          data: otpStatus,
        };
      },
      this.logger,
    );
  }

  @Put('/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update OTP status by ID' })
  @ApiResponse({ status: 200, description: 'OTP status updated successfully' })
  @ApiResponse({ status: 404, description: 'OTP status not found' })
  @ValidateBody(updateOtpStatusSchema)
  async updateOtpStatus(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() updateOtpStatusDto: UpdateOtpStatusDto,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to update this OTP status',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      response,
      async () => {
        const otpStatus = await this.otpStatusService.updateOtpStatus(
          id,
          updateOtpStatusDto,
        );
        return {
          statusCode: 200,
          message: 'OTP status updated successfully',
          data: otpStatus,
        };
      },
      this.logger,
    );
  }

  @Delete('/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete OTP status by ID' })
  @ApiResponse({ status: 200, description: 'OTP status deleted successfully' })
  @ApiResponse({ status: 404, description: 'OTP status not found' })
  async deleteOtpStatus(
    @Req() request: Request,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to delete this OTP status',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      response,
      async () => {
        await this.otpStatusService.deleteOtpStatus(id);
        return {
          statusCode: 200,
          message: 'OTP status deleted successfully',
          data: null,
        };
      },
      this.logger,
    );
  }
}
