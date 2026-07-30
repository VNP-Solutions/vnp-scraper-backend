import {
  Body,
  Controller,
  HttpStatus,
  Logger,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ValidateBody } from '../../common/decorators/validate.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookingRunService } from './booking-run.service';
import {
  BookingBulkPropertyRunJobGroupedRequestDto,
  BookingPropertyRunJobRequestDto,
} from './booking-run.dto';
import {
  bookingBulkPropertyRunJobGroupedSchema,
  bookingPropertyRunJobSchema,
} from './booking-run.validation';
import {
  BatchPropertyRunJobResponseDto,
  ErrorResponseDto,
  PropertyRunJobResponseDto,
} from './scraper.dto';

@ApiTags('Booking Scraper Runs')
@ApiBearerAuth('JWT-auth')
@Controller('/scraper')
export class BookingRunController {
  private readonly logger = new Logger(BookingRunController.name);

  constructor(private readonly bookingRunService: BookingRunService) {}

  @UseGuards(JwtAuthGuard)
  @Post('/api/booking/property-run-job')
  @ApiOperation({
    summary: 'Start a Booking property scraping job on a selected scraper URL',
    description:
      'Requires only booking_scraper_url_id and jobId. startDate, endDate, and property are loaded from the job record.',
  })
  @ApiBody({ type: BookingPropertyRunJobRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Booking property scraping job completed',
    type: PropertyRunJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or job is not Booking',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Booking scraper URL or job not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Booking scraper server error',
    type: ErrorResponseDto,
  })
  @ValidateBody(bookingPropertyRunJobSchema)
  async propertyRunJob(
    @Body() body: BookingPropertyRunJobRequestDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.bookingRunService.runPropertyJob(body);
      return res.status(result.status).json(result.data);
    } catch (error: any) {
      const status =
        error?.status ||
        error?.response?.status ||
        HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error?.response?.data || {
        success: false,
        message: error?.message || 'Booking scraper request failed',
      };
      return res.status(status).json(data);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('/api/booking/bulk-property-run-job-grouped')
  @ApiOperation({
    summary:
      'Start grouped bulk Booking property jobs on a selected scraper URL',
    description:
      'Requires booking_scraper_url_id and job_ids. Each job is loaded from the database for property/credentials grouping. Uses BOOKING_GROUPED_BULK_API_PATH on the remote host (default /api/booking/bulk-property-run-job).',
  })
  @ApiBody({ type: BookingBulkPropertyRunJobGroupedRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Grouped bulk Booking jobs processed',
    type: BatchPropertyRunJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Booking scraper URL not found',
    type: ErrorResponseDto,
  })
  @ValidateBody(bookingBulkPropertyRunJobGroupedSchema)
  async bulkPropertyRunJobGrouped(
    @Body() body: BookingBulkPropertyRunJobGroupedRequestDto,
    @Res() res: Response,
  ) {
    try {
      const result =
        await this.bookingRunService.runBulkPropertyJobsGrouped(body);
      return res.status(result.status).json(result);
    } catch (error: any) {
      this.logger.error(
        `bulk-property-run-job-grouped failed: ${error?.message}`,
        error?.stack,
      );
      const status =
        error?.status ||
        error?.response?.status ||
        HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        success: false,
        message: error?.message || 'Booking grouped bulk request failed',
      });
    }
  }
}
