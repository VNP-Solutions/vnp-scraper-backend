import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Post,
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
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateOnboardingDto } from './onboarding.dto';
import { IOnboardingService } from './onboarding.interface';
import { createOnboardingSchema } from './onboarding.validation';

@ApiTags('Onboarding')
@Controller('/onboarding')
export class OnboardingController {
  constructor(
    @Inject('IOnboardingService')
    private readonly onboardingService: IOnboardingService,
    private readonly logger: Logger,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'List onboarding submissions',
    description:
      'Paginated list with optional search (name, company, email, phone, Mongo id, or exact number_of_hotels when the search term is numeric) and createdAt date range.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description:
      'Search by name, company, email, phone, onboarding id (24-char hex), or number_of_hotels (numeric term only)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Page size (default 10)',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Sort field (e.g. createdAt, name, company, email)',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort direction',
  })
  @ApiQuery({
    name: 'start_date',
    required: false,
    description: 'Filter createdAt from (ISO date)',
  })
  @ApiQuery({
    name: 'end_date',
    required: false,
    description: 'Filter createdAt to (ISO date)',
  })
  @ApiResponse({ status: 200, description: 'Onboarding list retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.onboardingService.findAll(query);
        return {
          statusCode: 200,
          message: 'Onboarding records retrieved successfully',
          data: result.data,
          metadata: result.metadata,
        };
      },
      this.logger,
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Submit onboarding',
    description:
      'Creates an onboarding record and emails all addresses in ONBOARDING_EMAIL (comma- or semicolon-separated). Uses existing SMTP_* settings.',
  })
  @ApiResponse({ status: 201, description: 'Onboarding created successfully' })
  @ApiResponse({
    status: 502,
    description: 'Saved but failed to send notification email',
  })
  @ValidateBody(createOnboardingSchema)
  @ApiBody({ type: CreateOnboardingDto })
  async create(
    @Body() body: CreateOnboardingDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const data = await this.onboardingService.create(body);
        return {
          statusCode: 201,
          message: 'Onboarding submitted successfully',
          data,
        };
      },
      this.logger,
    );
  }
}
