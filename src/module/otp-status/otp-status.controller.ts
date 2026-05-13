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
  Query,
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
import { OtpPlatform } from '@prisma/client';
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
@Controller('/otp-status')
export class OtpStatusController {
  constructor(
    @Inject('IOtpStatusService')
    private readonly otpStatusService: IOtpStatusService,
    private readonly logger: Logger,
  ) {}

  @Get('/public')
  @ApiOperation({ summary: 'Get OTP status by platform (public endpoint)' })
  @ApiResponse({ status: 200, description: 'Returns OTP status for the specified platform' })
  @ApiResponse({ status: 400, description: 'Invalid platform' })
  @ApiResponse({ status: 404, description: 'OTP status not found for the platform' })
  @ApiQuery({
    name: 'platform',
    required: true,
    enum: OtpPlatform,
    description: 'Platform to get OTP status for',
  })
  async getOtpStatusByPlatform(
    @Query('platform') platform: OtpPlatform,
    @Res() response: Response,
  ) {
    if (!platform || !Object.values(OtpPlatform).includes(platform)) {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 400,
            message: 'Invalid platform. Valid platforms are: ' + Object.values(OtpPlatform).join(', '),
            data: null,
          };
        },
        this.logger,
      );
    }

    return ResponseHandler.handler(
      response,
      async () => {
        const otpStatus = await this.otpStatusService.getOtpStatusByPlatform(platform);
        if (!otpStatus) {
          return {
            statusCode: 404,
            message: `OTP status not found for platform: ${platform}`,
            data: null,
          };
        }
        return {
          statusCode: 200,
          message: 'OTP status retrieved successfully',
          data: otpStatus,
        };
      },
      this.logger,
    );
  }

  @Post()
  @ApiBearerAuth('JWT-auth')
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
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all OTP statuses' })
  @ApiResponse({ status: 200, description: 'Returns all OTP statuses' })
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
  @ApiBearerAuth('JWT-auth')
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
  @ApiBearerAuth('JWT-auth')
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
