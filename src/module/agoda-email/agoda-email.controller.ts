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
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AgodaEmailListResponseDto,
  AgodaEmailResponseDto,
  CreateAgodaEmailDto,
  UpdateAgodaEmailDto,
} from './agoda-email.dto';
import { AgodaEmailFilters, IAgodaEmailService } from './agoda-email.interface';
import {
  createAgodaEmailSchema,
  updateAgodaEmailSchema,
} from './agoda-email.validation';

@ApiTags('Agoda Emails')
@ApiBearerAuth('JWT-auth')
@Controller('agoda-emails')
@UseGuards(JwtAuthGuard)
export class AgodaEmailController {
  private readonly logger = new Logger(AgodaEmailController.name);

  constructor(
    @Inject('IAgodaEmailService')
    private readonly agodaEmailService: IAgodaEmailService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new agoda email' })
  @ApiResponse({
    status: 201,
    description: 'Agoda email created successfully',
    type: AgodaEmailResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ValidateBody(createAgodaEmailSchema)
  async create(@Body() body: CreateAgodaEmailDto, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const item = await this.agodaEmailService.create(body);
        return {
          statusCode: 201,
          message: 'Agoda email created successfully',
          data: item,
        };
      },
      this.logger,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all agoda emails with pagination and search' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by ID, email_id, subject, from or to',
  })
  @ApiQuery({
    name: 'job_id',
    required: false,
    description: 'Filter by job ID',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
    example: 10,
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order',
    example: 'desc',
  })
  @ApiResponse({
    status: 200,
    description: 'Agoda emails retrieved successfully',
    type: AgodaEmailListResponseDto,
  })
  async findAll(
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const filters: AgodaEmailFilters = {};
        const { search, job_id, page, limit, order } = query;

        if (search) filters.search = search;
        if (job_id) filters.job_id = job_id;
        if (page) filters.page = page;
        if (limit) filters.limit = limit;
        if (order) filters.order = order;

        const result = await this.agodaEmailService.findAll(filters);

        return {
          statusCode: 200,
          message: 'Agoda emails retrieved successfully',
          data: result.items,
          metadata: {
            totalDocuments: result.totalDocuments,
            currentPage: result.currentPage,
            totalPage: result.totalPage,
            limit: result.limit,
          },
        };
      },
      this.logger,
    );
  }

  @Get('/job/:jobId')
  @ApiOperation({ summary: 'Get all agoda emails of a job' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({
    status: 200,
    description: 'Agoda emails retrieved successfully',
    type: [AgodaEmailResponseDto],
  })
  async findByJobId(@Param('jobId') jobId: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const items = await this.agodaEmailService.findByJobId(jobId);
        return {
          statusCode: 200,
          message: 'Agoda emails retrieved successfully',
          data: items,
        };
      },
      this.logger,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an agoda email by ID' })
  @ApiParam({ name: 'id', description: 'Agoda email ID' })
  @ApiResponse({
    status: 200,
    description: 'Agoda email retrieved successfully',
    type: AgodaEmailResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Agoda email not found' })
  async findById(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const item = await this.agodaEmailService.findById(id);
        return {
          statusCode: 200,
          message: 'Agoda email retrieved successfully',
          data: item,
        };
      },
      this.logger,
    );
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an agoda email' })
  @ApiParam({ name: 'id', description: 'Agoda email ID' })
  @ApiResponse({
    status: 200,
    description: 'Agoda email updated successfully',
    type: AgodaEmailResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Agoda email or job not found' })
  @ValidateBody(updateAgodaEmailSchema)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateAgodaEmailDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const item = await this.agodaEmailService.update(id, body);
        return {
          statusCode: 200,
          message: 'Agoda email updated successfully',
          data: item,
        };
      },
      this.logger,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an agoda email' })
  @ApiParam({ name: 'id', description: 'Agoda email ID' })
  @ApiResponse({ status: 200, description: 'Agoda email deleted successfully' })
  @ApiResponse({ status: 404, description: 'Agoda email not found' })
  async delete(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.agodaEmailService.delete(id);
        return {
          statusCode: 200,
          message: 'Agoda email deleted successfully',
          data: result,
        };
      },
      this.logger,
    );
  }
}
