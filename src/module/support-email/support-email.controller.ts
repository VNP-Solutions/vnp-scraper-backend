import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ValidateBody } from '../../common/decorators/validate.decorator';
import { ResponseHandler } from '../../common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  RunSupportEmailJobDto,
  RunSupportEmailJobResponseDto,
  SupportEmailByIdResponseDto,
  SupportEmailForJobResponseDto,
} from './support-email.dto';
import { ISupportEmailService } from './support-email.interface';
import { runSupportEmailJobSchema } from './support-email.validation';

@ApiTags('Agoda Support Email')
@ApiBearerAuth('JWT-auth')
@Controller()
export class SupportEmailController {
  private readonly logger = new Logger(SupportEmailController.name);

  constructor(
    @Inject('ISupportEmailService')
    private readonly supportEmailService: ISupportEmailService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('/api/agoda/retrive-case-email')
  @ApiOperation({
    summary: 'Capture and classify the Agoda Partner Support reply for a batch of jobs',
    description:
      'For each Completed Agoda job, resolves the property Agoda ID, searches Gmail under the Agoda label for the newest ' +
      'message from PartnerSupport@agoda.com since the job was last updated, parses its body and any CSV/XLSX attachment, ' +
      'archives attachments to S3, stores the message (deduplicated on Gmail message_id) along with the rest of the ' +
      'labelled conversation, and writes reply_status (RepliedRed / RepliedGreen / NoReplied) back onto the job. ' +
      'Takes no action on the contents beyond that.',
  })
  @ApiBody({ type: RunSupportEmailJobDto })
  @ApiResponse({
    status: 200,
    description: 'Jobs processed; reply_status written back on each',
    type: RunSupportEmailJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'job_ids is missing, empty, or malformed',
  })
  @ApiResponse({
    status: 500,
    description: 'Error scraping Agoda support emails',
  })
  @ValidateBody(runSupportEmailJobSchema)
  async runSupportEmailJob(
    @Body() body: RunSupportEmailJobDto,
    @Res() res: Response,
  ) {
    try {
      const { message, results } = await this.supportEmailService.runJob(
        body.job_ids,
      );

      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message,
        results,
      });
    } catch (error: any) {
      this.logger.error(
        `Error in /api/agoda/retrive-case-email: ${error?.message}`,
        error?.stack,
      );
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error scraping Agoda support emails',
        error: error?.message || String(error),
      });
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('/jobs/:jobId/support-email')
  @ApiOperation({
    summary: 'Get every stored Agoda Partner Support email captured for a job',
    description:
      "Reads every support_emails document whose job_id matches this job (newest first) — nothing is fetched from Gmail here. Capture it first with POST /api/agoda/retrive-case-email. `data.emails` is `[]` when nothing has been captured yet for this job.",
  })
  @ApiParam({ name: 'jobId', description: 'MongoDB ObjectId of the job' })
  @ApiResponse({
    status: 200,
    description: 'Lookup completed (emails may be an empty array)',
    type: SupportEmailForJobResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getSupportEmailForJob(
    @Param('jobId') jobId: string,
    @Res() res: Response,
  ) {
    return ResponseHandler.handler(
      res,
      async () => {
        const result =
          await this.supportEmailService.getSupportEmailsForJob(jobId);

        const message = result.emails.length
          ? `${result.emails.length} support email(s) retrieved successfully`
          : 'No stored Agoda Partner Support email captured for this job yet — capture it with POST /api/agoda/retrive-case-email first.';

        return {
          statusCode: HttpStatus.OK,
          message,
          data: result,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('/support-email/:id')
  @ApiOperation({
    summary: 'Get a single stored support email by its own id',
    description:
      "Fetches one support_emails document directly by its _id — for a detail view once the frontend already has an id (e.g. picked from a list). Doesn't scrape Gmail.",
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the support_emails document' })
  @ApiResponse({
    status: 200,
    description: 'Support email retrieved successfully',
    type: SupportEmailByIdResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Support email not found' })
  async getSupportEmailById(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return ResponseHandler.handler(
      res,
      async () => {
        const email = await this.supportEmailService.getSupportEmailById(id);
        return {
          statusCode: HttpStatus.OK,
          message: 'Support email retrieved successfully',
          data: email,
        };
      },
      this.logger,
    );
  }
}
