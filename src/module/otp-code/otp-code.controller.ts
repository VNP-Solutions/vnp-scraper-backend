import {
  Body,
  Controller,
  Inject,
  Logger,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateOtpCodeDto } from './otp-code.dto';
import { IOtpCodeService } from './otp-code.interface';
import { createOtpCodeSchema } from './otp-code.validation';

@ApiTags('OTP Code')
@ApiBearerAuth('JWT-auth')
@Controller('/otp-code')
export class OtpCodeController {
  constructor(
    @Inject('IOtpCodeService')
    private readonly otpCodeService: IOtpCodeService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new OTP code (used defaults to false)' })
  @ApiResponse({ status: 200, description: 'OTP code created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ValidateBody(createOtpCodeSchema)
  @UseGuards(JwtAuthGuard)
  async createOtpCode(
    @Body() createOtpCodeDto: CreateOtpCodeDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const res =
          await this.otpCodeService.createOtpCode(createOtpCodeDto);
        return {
          statusCode: 200,
          message: 'OTP code created successfully',
          data: res,
        };
      },
      this.logger,
    );
  }
}
