import {
  Body,
  Controller,
  HttpStatus,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ValidateBody } from '../../common/decorators/validate.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RunSupportEmailJobDto, RunSupportEmailJobResponseDto } from './support-email.dto';
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
}
