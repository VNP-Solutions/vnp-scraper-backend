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
      'Requires only booking_scraper_url_id and jobId. Validates the job, then queues the scraper call and returns immediately without waiting for the scraper to finish.',
  })
  @ApiBody({ type: BookingPropertyRunJobRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Booking property scraping job queued (scraper runs in background)',
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
      'Requires booking_scraper_url_id and job_ids. Validates jobs, queues grouped scraper dispatch, and returns immediately without waiting for the scraper to finish.',
  })
  @ApiBody({ type: BookingBulkPropertyRunJobGroupedRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Grouped bulk Booking jobs queued (scraper runs in background)',
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
