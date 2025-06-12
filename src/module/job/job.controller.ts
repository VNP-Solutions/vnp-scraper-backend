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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateJobDto, UpdateJobDto } from './job.dto';
import { IJobService } from './job.interface';
import { createJobSchema } from './job.validation';

@ApiTags('Jobs')
@ApiBearerAuth('JWT-auth')
@Controller('/jobs')
export class JobController {
  constructor(
    @Inject('IJobService')
    private readonly jobService: IJobService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create new job' })
  @ApiResponse({ status: 201, description: 'Job created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ValidateBody(createJobSchema)
  @UseGuards(JwtAuthGuard)
  async createJob(
    @Body() createJobDto: CreateJobDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const job = await this.jobService.createJob(createJobDto);
        return {
          statusCode: 201,
          message: 'Job created successfully',
          data: job,
        };
      },
      this.logger,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all jobs' })
  @ApiResponse({ status: 200, description: 'Returns list of jobs' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search jobs by portfolio, sub-portfolio, or property name',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: 'number',
    description: 'Page number for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'number',
    description: 'Number of items per page',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Field to sort by',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order (asc or desc)',
  })
  @ApiQuery({
    name: 'start_date',
    required: false,
    description: 'Start date for filtering',
  })
  @ApiQuery({
    name: 'end_date',
    required: false,
    description: 'End date for filtering',
  })
  @UseGuards(JwtAuthGuard)
  @ParseQuery()
  async getAllJobs(
    @Query() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const jobs = await this.jobService.getAllJobs(query);
        return {
          statusCode: 200,
          message: 'Jobs retrieved successfully',
          data: jobs,
        };
      },
      this.logger,
    );
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Get job by ID' })
  @ApiResponse({ status: 200, description: 'Returns job' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @UseGuards(JwtAuthGuard)
  async getJobById(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const job = await this.jobService.getJobById(id);
        return {
          statusCode: 200,
          message: 'Job retrieved successfully',
          data: job,
        };
      },
      this.logger,
    );
  }

  @Put('/:id')
  @ApiOperation({ summary: 'Update job by ID' })
  @ApiResponse({ status: 200, description: 'Job updated successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @UseGuards(JwtAuthGuard)
  async updateJob(
    @Param('id') id: string,
    @Body() updateJobDto: UpdateJobDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const job = await this.jobService.updateJob(id, updateJobDto);
        return {
          statusCode: 200,
          message: 'Job updated successfully',
          data: job,
        };
      },
      this.logger,
    );
  }

  @Delete('/:id')
  @ApiOperation({ summary: 'Delete job by ID' })
  @ApiResponse({ status: 200, description: 'Job deleted successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @UseGuards(JwtAuthGuard)
  async deleteJob(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        await this.jobService.deleteJob(id);
        return {
          statusCode: 200,
          message: 'Job deleted successfully',
          data: null,
        };
      },
      this.logger,
    );
  }
}

const data = {
  guestName: 'DEREK FLEENER',
  reservationId: '2210809156',
  confirmationCode: '9658SF187948',
  checkInDate: 'May 31, 2025',
  checkOutDate: 'Jun 01, 2025',
  roomType: 'Room, 2 Queen Beds, City View',
  bookingAmount: '189.33',
  bookedDate: 'May 31, 2025',
  cardNumber: '3700 2168 4147 026',
  expiryDate: '05/2030',
  cvv: '1634',
  status: 'Charged in full',
  additionalText: "You've charged USD 189.33. | This was an Expedia Collect booking that was paid out through Expedia Virtual Card. | Amount to chargeUSD0.00 | USD0.00",
  totalGuestPayment: '236.66',
  cancellationFee: '',
  expediaCompensation: '47.33',
  totalPayout: '189.33',
  propertyId: '39161277',
  hasCardInfo: true,
  hasPaymentInfo: true,
  remainingAmountToCharge: 'N/A',
  amountToRefund: 'N/A',
  amountToChargeOrRefund: "You've charged USD 189.33. | This was an Expedia Collect booking that was paid out through Expedia Virtual Card. | Amount to chargeUSD0.00 | USD0.00",
  amount: '0.00'
}