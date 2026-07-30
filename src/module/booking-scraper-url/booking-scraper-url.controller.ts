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
  BookingScraperUrlListResponseDto,
  BookingScraperUrlResponseDto,
  BulkDeleteBookingScraperUrlDto,
  CreateBookingScraperUrlDto,
  UpdateBookingScraperUrlDto,
} from './booking-scraper-url.dto';
import { IBookingScraperUrlService } from './booking-scraper-url.interface';
import {
  bulkDeleteBookingScraperUrlSchema,
  createBookingScraperUrlSchema,
  updateBookingScraperUrlSchema,
} from './booking-scraper-url.validation';

@ApiTags('Booking Scraper URLs')
@ApiBearerAuth('JWT-auth')
@Controller('booking-scraper-urls')
export class BookingScraperUrlController {
  private readonly logger = new Logger(BookingScraperUrlController.name);

  constructor(
    @Inject('IBookingScraperUrlService')
    private readonly bookingScraperUrlService: IBookingScraperUrlService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Create a new booking scraper URL' })
  @ApiResponse({
    status: 201,
    description: 'Booking scraper URL created successfully',
    type: BookingScraperUrlResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 409, description: 'URL already exists' })
  @ValidateBody(createBookingScraperUrlSchema)
  async create(
    @Body() body: CreateBookingScraperUrlDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const item = await this.bookingScraperUrlService.create(body);
        return {
          statusCode: 201,
          message: 'Booking scraper URL created successfully',
          data: item,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({
    summary: 'Get all booking scraper URLs with pagination and search',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by URL or ID',
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
    description: 'Booking scraper URLs retrieved successfully',
    type: BookingScraperUrlListResponseDto,
  })
  async findAll(
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const filters: any = {};
        const { search, page, limit, order } = query;

        if (search) filters.search = search;
        if (page) filters.page = page;
        if (limit) filters.limit = limit;
        if (order) filters.order = order;

        const result = await this.bookingScraperUrlService.findAll(filters);

        return {
          statusCode: 200,
          message: 'Booking scraper URLs retrieved successfully',
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

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get a booking scraper URL by ID' })
  @ApiParam({ name: 'id', description: 'Booking scraper URL ID' })
  @ApiResponse({
    status: 200,
    description: 'Booking scraper URL retrieved successfully',
    type: BookingScraperUrlResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Booking scraper URL not found' })
  async findById(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const item = await this.bookingScraperUrlService.findById(id);
        return {
          statusCode: 200,
          message: 'Booking scraper URL retrieved successfully',
          data: item,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @ApiOperation({ summary: 'Update a booking scraper URL' })
  @ApiParam({ name: 'id', description: 'Booking scraper URL ID' })
  @ApiResponse({
    status: 200,
    description: 'Booking scraper URL updated successfully',
    type: BookingScraperUrlResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Booking scraper URL not found' })
  @ApiResponse({ status: 409, description: 'URL already exists' })
  @ValidateBody(updateBookingScraperUrlSchema)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateBookingScraperUrlDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const item = await this.bookingScraperUrlService.update(id, body);
        return {
          statusCode: 200,
          message: 'Booking scraper URL updated successfully',
          data: item,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a booking scraper URL' })
  @ApiParam({ name: 'id', description: 'Booking scraper URL ID' })
  @ApiResponse({
    status: 200,
    description: 'Booking scraper URL deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Booking scraper URL not found' })
  async delete(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.bookingScraperUrlService.delete(id);
        return {
          statusCode: 200,
          message: 'Booking scraper URL deleted successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('/bulk-delete')
  @ApiOperation({ summary: 'Bulk delete booking scraper URLs' })
  @ApiResponse({
    status: 200,
    description: 'Booking scraper URLs deleted successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ValidateBody(bulkDeleteBookingScraperUrlSchema)
  async bulkDelete(
    @Body() body: BulkDeleteBookingScraperUrlDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.bookingScraperUrlService.bulkDelete(body.ids);
        return {
          statusCode: 200,
          message: `Successfully deleted ${result.deletedCount} booking scraper URL(s)`,
          data: result,
        };
      },
      this.logger,
    );
  }
}
