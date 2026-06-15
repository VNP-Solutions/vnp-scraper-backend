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
import { QaPanelStatus } from '@prisma/client';
import { Response } from 'express';
import { ParseQuery } from '../../common/decorators/parse-query.decorator';
import { ValidateBody } from '../../common/decorators/validate.decorator';
import { ExcelFileInterceptor } from '../../common/interceptors/excel-file.interceptor';
import { ResponseHandler } from '../../common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  BulkDeleteQaPanelDto,
  CreateQaPanelDto,
  QaPanelImportCallbackDto,
  QaPanelListResponseDto,
  QaPanelResponseDto,
  QaPanelUploadApiResponseDto,
  UpdateQaPanelDto,
} from './qa-panel.dto';
import { ExternalJwtGuard } from './guards/external-jwt.guard';
import { IQaPanelService } from './qa-panel.interface';
import {
  bulkDeleteQaPanelSchema,
  createQaPanelSchema,
  qaPanelImportCallbackSchema,
  updateQaPanelSchema,
} from './qa-panel.validation';

@ApiTags('QA Panel')
@Controller('qa-panel')
export class QaPanelController {
  private readonly logger = new Logger(QaPanelController.name);

  constructor(
    @Inject('IQaPanelService')
    private readonly qaPanelService: IQaPanelService,
  ) {}

  @Post('import-callback')
  @UseGuards(ExternalJwtGuard)
  @ApiBearerAuth('external-jwt')
  @ValidateBody(qaPanelImportCallbackSchema)
  @ApiOperation({
    summary: 'External import callback (dashboard proxy)',
    description:
      'Called by the external dashboard server after import processing. Updates the QA panel record and emails the report summary. Requires a communication JWT.',
  })
  @ApiResponse({
    status: 200,
    description: 'QA panel updated and report email sent',
    type: QaPanelResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid communication token' })
  @ApiResponse({ status: 404, description: 'QA panel not found' })
  async importCallback(
    @Body() body: QaPanelImportCallbackDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const qaPanel = await this.qaPanelService.processImportCallback(body);
        return {
          statusCode: 200,
          message: 'QA panel import callback processed successfully',
          data: qaPanel,
        };
      },
      this.logger,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ValidateBody(createQaPanelSchema)
  @ApiOperation({ summary: 'Create a QA panel record' })
  @ApiResponse({
    status: 201,
    description: 'QA panel created successfully',
    type: QaPanelResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async create(
    @Body() body: CreateQaPanelDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const qaPanel = await this.qaPanelService.createQaPanel(body);
        return {
          statusCode: 201,
          message: 'QA panel created successfully',
          data: qaPanel,
        };
      },
      this.logger,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get all QA panel records with pagination and filtering' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by file name, file URL, or ID' })
  @ApiQuery({ name: 'status', required: false, enum: QaPanelStatus, description: 'Filter by status' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'], example: 'desc' })
  @ApiResponse({
    status: 200,
    description: 'QA panels retrieved successfully',
    type: QaPanelListResponseDto,
  })
  async findAll(
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const filters: Record<string, unknown> = {};
        const { search, status, page, limit, order } = query;

        if (search) filters.search = search;
        if (status) filters.status = status;
        if (page) filters.page = page;
        if (limit) filters.limit = limit;
        if (order) filters.order = order;

        const result = await this.qaPanelService.findAllQaPanels(filters as any);

        return {
          statusCode: 200,
          message: 'QA panels retrieved successfully',
          data: result.qaPanels,
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

  @Post('bulk-delete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ValidateBody(bulkDeleteQaPanelSchema)
  @ApiOperation({ summary: 'Bulk delete QA panel records' })
  @ApiResponse({ status: 200, description: 'QA panels deleted successfully' })
  @ApiResponse({ status: 404, description: 'No QA panel records found' })
  async bulkDelete(
    @Body() body: BulkDeleteQaPanelDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.qaPanelService.bulkDeleteQaPanels(body.ids);
        return {
          statusCode: 200,
          message: `Successfully deleted ${result.deletedCount} QA panel record(s)`,
          data: result,
        };
      },
      this.logger,
    );
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @UseInterceptors(ExcelFileInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a CSV/XLSX file for QA panel processing',
    description:
      'Uploads the file to S3, creates a QA panel record, forwards the file and qa_panel_id to the dashboard proxy API, then returns the proxy response in data.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Excel (.xlsx, .xls) or CSV file',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard proxy response returned in the data field',
    type: QaPanelUploadApiResponseDto,
    schema: {
      example: {
        statusCode: 200,
        message: 'Import is on Processing',
        data: {
          success: true,
          message: 'Import is on Processing',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid file or missing configuration' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        if (!file) {
          return {
            statusCode: 400,
            message: 'A CSV or XLSX file is required',
            data: null,
          };
        }

        const proxyResponse = await this.qaPanelService.uploadAndProcess(file);
        const proxyMessage =
          proxyResponse &&
          typeof proxyResponse === 'object' &&
          'message' in proxyResponse &&
          typeof (proxyResponse as { message?: unknown }).message === 'string'
            ? (proxyResponse as { message: string }).message
            : 'QA panel file processed successfully';

        return {
          statusCode: 200,
          message: proxyMessage,
          data: proxyResponse,
        };
      },
      this.logger,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get a QA panel record by ID' })
  @ApiParam({ name: 'id', description: 'QA panel ID' })
  @ApiResponse({
    status: 200,
    description: 'QA panel retrieved successfully',
    type: QaPanelResponseDto,
  })
  @ApiResponse({ status: 404, description: 'QA panel not found' })
  async findById(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const qaPanel = await this.qaPanelService.findQaPanelById(id);
        return {
          statusCode: 200,
          message: 'QA panel retrieved successfully',
          data: qaPanel,
        };
      },
      this.logger,
    );
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ValidateBody(updateQaPanelSchema)
  @ApiOperation({ summary: 'Update a QA panel record' })
  @ApiParam({ name: 'id', description: 'QA panel ID' })
  @ApiResponse({
    status: 200,
    description: 'QA panel updated successfully',
    type: QaPanelResponseDto,
  })
  @ApiResponse({ status: 404, description: 'QA panel not found' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateQaPanelDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const qaPanel = await this.qaPanelService.updateQaPanel(id, body);
        return {
          statusCode: 200,
          message: 'QA panel updated successfully',
          data: qaPanel,
        };
      },
      this.logger,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a QA panel record' })
  @ApiParam({ name: 'id', description: 'QA panel ID' })
  @ApiResponse({ status: 200, description: 'QA panel deleted successfully' })
  @ApiResponse({ status: 404, description: 'QA panel not found' })
  async delete(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.qaPanelService.deleteQaPanel(id);
        return {
          statusCode: 200,
          message: 'QA panel deleted successfully',
          data: result,
        };
      },
      this.logger,
    );
  }
}
