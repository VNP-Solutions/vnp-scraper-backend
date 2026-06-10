import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateJobOtpDto,
  UpdateJobOtpDto,
} from './job-otp.dto';
import { IJobOtpService } from './job-otp.interface';
import {
  createJobOtpSchema,
  updateJobOtpSchema,
} from './job-otp.validation';

@ApiTags('Job Current OTP')
@ApiBearerAuth('JWT-auth')
@Controller('/job-current-otps')
@UseGuards(JwtAuthGuard)
export class JobOtpController {
  constructor(
    @Inject('IJobOtpService')
    private readonly jobOtpService: IJobOtpService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @ValidateBody(createJobOtpSchema)
  @ApiBody({ type: CreateJobOtpDto })
  @ApiOperation({ summary: 'Create a job OTP record' })
  @ApiResponse({ status: 200, description: 'Job OTP created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createJobOtp(
    @Body() dto: CreateJobOtpDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const data = await this.jobOtpService.createJobOtp(dto);
        return {
          statusCode: 200,
          message: 'Job OTP created successfully',
          data,
        };
      },
      this.logger,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get job OTP by job_id query param',
    description:
      'Returns the latest job current OTP for the given job_id. Use GET /job-current-otps/:id to fetch by record id.',
  })
  @ApiQuery({
    name: 'job_id',
    required: true,
    description: 'Job ID',
  })
  @ApiResponse({ status: 200, description: 'Job OTP retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Job OTP not found' })
  async getJobOtpByJobId(
    @Query('job_id') jobId: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const data = await this.jobOtpService.getJobOtpByJobId(jobId);
        return {
          statusCode: 200,
          message: 'Job OTP retrieved successfully',
          data,
        };
      },
      this.logger,
    );
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Get job OTP by record ID' })
  @ApiResponse({ status: 200, description: 'Job OTP retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Job OTP not found' })
  async getJobOtpById(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const data = await this.jobOtpService.getJobOtpById(id);
        return {
          statusCode: 200,
          message: 'Job OTP retrieved successfully',
          data,
        };
      },
      this.logger,
    );
  }

  @Put('/:id')
  @ValidateBody(updateJobOtpSchema)
  @ApiBody({ type: UpdateJobOtpDto })
  @ApiOperation({ summary: 'Update job OTP by record ID' })
  @ApiResponse({ status: 200, description: 'Job OTP updated successfully' })
  @ApiResponse({ status: 404, description: 'Job OTP not found' })
  async updateJobOtp(
    @Param('id') id: string,
    @Body() dto: UpdateJobOtpDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const data = await this.jobOtpService.updateJobOtp(id, dto);
        return {
          statusCode: 200,
          message: 'Job OTP updated successfully',
          data,
        };
      },
      this.logger,
    );
  }
}
