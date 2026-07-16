import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ParseQuery } from '../../common/decorators/parse-query.decorator';
import { LargeExcelFileInterceptor } from '../../common/interceptors/excel-file.interceptor';
import { ResponseHandler } from '../../common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  OtaPostPreChargingEmailQueuedResponseDto,
  OtaPostPreChargingListResponseDto,
  OtaPostPreChargingResponseDto,
} from './ota-post-pre-charging.dto';
import { IOtaPostPreChargingService } from './ota-post-pre-charging.interface';
import { otaPostPreChargingListQuerySchema } from './ota-post-pre-charging.validation';

@ApiTags('OTA Post Pre-Charging')
@Controller('ota-post-pre-charging')
export class OtaPostPreChargingController {
  private readonly logger = new Logger(OtaPostPreChargingController.name);

  constructor(
    @Inject('IOtaPostPreChargingService')
    private readonly service: IOtaPostPreChargingService,
  ) {}

  @Post('convert')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @UseInterceptors(LargeExcelFileInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Convert import file to OTA post pre-charging template',
    description:
      'Upload a CSV/XLSX master export file and convert it to the OTA post pre-charging template. ' +
      'If the row count is less than 1000, the XLSX file is returned directly. ' +
      'If the row count is 1000 or more, the request is queued for background streaming conversion ' +
      'and a download link is emailed when ready.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'CSV or Excel file (.csv, .xlsx, .xls)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Converted XLSX returned directly for files with fewer than 1000 rows',
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({
    status: 202,
    description:
      'Conversion queued for background streaming processing and email delivery for files with 1000 or more rows',
    type: OtaPostPreChargingEmailQueuedResponseDto,
  })
  async convert(
    @Req() req: { user?: { userId?: string; email?: string; name?: string } },
    @UploadedFile() file: Express.Multer.File,
    @Res() response: Response,
  ) {
    try {
      if (!req.user?.userId) {
        response.status(401).json({
          statusCode: 401,
          message: 'User not authenticated',
          data: null,
        });
        return;
      }

      const result = await this.service.convertTemplate(file, {
        userId: req.user.userId,
        email: req.user.email ?? '',
        name: req.user.name,
      });

      if (result.mode === 'queued') {
        response.status(202).json({
          statusCode: 202,
          message: `Your converted file is being prepared. We will email a download link to ${result.email} when it's ready.`,
          data: {
            id: result.recordId,
            estimatedRowCount: result.estimatedRowCount,
            delivery: 'Email',
            status: 'Processing',
            email: result.email,
          },
        });
        return;
      }

      response.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.fileName}"`,
      );
      response.setHeader('Content-Length', result.buffer.length);
      response.setHeader('X-Conversion-Record-Id', result.recordId);
      response.setHeader('X-Converted-Row-Count', String(result.rowCount));
      response.status(200).send(result.buffer);
      return;
    } catch (error: any) {
      this.logger.error(
        `Error in POST /ota-post-pre-charging/convert: ${error.message}`,
        error.stack,
      );
      const status =
        typeof error?.getStatus === 'function' ? error.getStatus() : 500;
      response.status(status).json({
        statusCode: status,
        message: error?.message ?? 'Unexpected error while converting file',
        data: null,
      });
    }
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List OTA post pre-charging conversion history' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'], example: 'desc' })
  @ApiResponse({
    status: 200,
    description: 'Conversion history retrieved successfully',
    type: OtaPostPreChargingListResponseDto,
  })
  async findAll(
    @Req() req: { user?: { userId?: string } },
    @ParseQuery() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const parsedQuery = otaPostPreChargingListQuerySchema.safeParse(query);

        if (!parsedQuery.success) {
          const formattedErrors = parsedQuery.error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          }));

          throw new BadRequestException({
            statusCode: 400,
            message: 'Validation failed',
            errors: formattedErrors,
          });
        }

        const result = await this.service.findAllRecords({
          user_id: req.user?.userId,
          ...parsedQuery.data,
        });

        return {
          statusCode: 200,
          message: 'OTA post pre-charging records retrieved successfully',
          data: result.records,
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

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get an OTA post pre-charging conversion record by ID' })
  @ApiParam({ name: 'id', description: 'Conversion record ID' })
  @ApiResponse({
    status: 200,
    description: 'Conversion record retrieved successfully',
    type: OtaPostPreChargingResponseDto,
  })
  async findById(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const record = await this.service.findRecordById(id);
        return {
          statusCode: 200,
          message: 'OTA post pre-charging record retrieved successfully',
          data: record,
        };
      },
      this.logger,
    );
  }
}
