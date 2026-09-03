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
import {
  RunSendToRetrievalJobDto,
  RunSendToRetrievalJobResponseDto,
} from './send-to-retrieval.dto';
import { ISendToRetrievalService } from './send-to-retrieval.interface';
import { runSendToRetrievalJobSchema } from './send-to-retrieval.validation';

@ApiTags('Agoda Send To Retrieval')
@ApiBearerAuth('JWT-auth')
@Controller()
export class SendToRetrievalController {
  private readonly logger = new Logger(SendToRetrievalController.name);

  constructor(
    @Inject('ISendToRetrievalService')
    private readonly sendToRetrievalService: ISendToRetrievalService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('/api/agoda/send-to-retrieval')
  @ApiOperation({
    summary:
      'Hand collectable Agoda bookings from a stored Partner Support reply to the retrieval side',
    description:
      'For each Completed job, reads the newest stored Partner Support reply (captured by POST /api/agoda/retrive-case-email). ' +
      'Skips the job if there is no stored reply yet, if it still needs a case reopen, or if it has no collectable bookings. ' +
      'Otherwise writes one ParentRetrieval per call and one Retrieval per property with the collectable booking IDs in reservations[]. ' +
      'Never contacts Gmail.',
  })
  @ApiBody({ type: RunSendToRetrievalJobDto })
  @ApiResponse({
    status: 200,
    description: 'Jobs processed; retrieval(s) created for the collectable candidates',
    type: RunSendToRetrievalJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'job_ids is missing, empty, or malformed',
  })
  @ApiResponse({
    status: 500,
    description: 'Error sending Agoda bookings to retrieval',
  })
  @ValidateBody(runSendToRetrievalJobSchema)
  async runSendToRetrievalJob(
    @Body() body: RunSendToRetrievalJobDto,
    @Res() res: Response,
  ) {
    try {
      const { message, results } = await this.sendToRetrievalService.runJob(
        body.job_ids,
      );

      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message,
        results,
      });
    } catch (error: any) {
      this.logger.error(
        `Error in /api/agoda/send-to-retrieval: ${error?.message}`,
        error?.stack,
      );
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error sending Agoda bookings to retrieval',
        error: error?.message || String(error),
      });
    }
  }
}
