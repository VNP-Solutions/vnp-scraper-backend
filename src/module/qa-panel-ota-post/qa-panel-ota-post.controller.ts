import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Put,
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
import { QaPanelStatus } from '@prisma/client';
import { Response } from 'express';
import { ParseQuery } from '../../common/decorators/parse-query.decorator';
import { ValidateBody } from '../../common/decorators/validate.decorator';
import { ExcelFileInterceptor } from '../../common/interceptors/excel-file.interceptor';
import { MongoObjectIdPipe } from '../../common/pipes/mongo-object-id.pipe';
import { ResponseHandler } from '../../common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  BulkDeleteQaPanelOtaPostDto,
  CreateQaPanelOtaPostDto,
  GenerateCommunicationTokenOtaPostApiResponseDto,
  QaPanelOtaPostImportCallbackDto,
  QaPanelOtaPostListResponseDto,
  QaPanelOtaPostResponseDto,
  QaPanelOtaPostUploadApiResponseDto,
  UpdateQaPanelOtaPostDto,
} from './qa-panel-ota-post.dto';
import { ExternalJwtGuard } from './guards/external-jwt.guard';
import { ExternalRawSecretGuard } from './guards/external-raw-secret.guard';
import { IQaPanelOtaPostService } from './qa-panel-ota-post.interface';
import {
  bulkDeleteQaPanelOtaPostSchema,
  createQaPanelOtaPostSchema,
  qaPanelOtaPostImportCallbackSchema,
  qaPanelOtaPostListQuerySchema,
  updateQaPanelOtaPostSchema,
} from './qa-panel-ota-post.validation';

@ApiTags('QA Panel OTA Post')
@Controller('qa-panel/ota-post')
export class QaPanelOtaPostController {
  private readonly logger = new Logger(QaPanelOtaPostController.name);

  constructor(
    @Inject('IQaPanelOtaPostService')
    private readonly qaPanelOtaPostService: IQaPanelOtaPostService,
  ) {}

  @Post('generate-token')
  @UseGuards(ExternalRawSecretGuard)
  @ApiBearerAuth('communication-secret')
  @ApiOperation({
    summary: 'Generate external communication JWT',
    description:
      'Exchange the raw JWT_COMMUNICATION_SECRET for a signed communication JWT (type: external-communication). Same pattern as the dashboard proxy generate-token endpoint.',
  })
  @ApiResponse({
    status: 200,
    description: 'Communication token generated successfully',
    type: GenerateCommunicationTokenOtaPostApiResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid communication secret' })
  async generateToken(@Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.qaPanelOtaPostService.generateCommunicationToken();
        return {
          statusCode: 200,
          message: 'Communication token generated successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Post('import-callback')
  @UseGuards(ExternalJwtGuard)
  @ApiBearerAuth('external-jwt')
  @ValidateBody(qaPanelOtaPostImportCallbackSchema)
  @ApiOperation({
    summary: 'External import callback (dashboard proxy)',
    description:
      'Called by the external dashboard server after import processing. Updates the QA panel record and emails the report summary. Requires a communication JWT.',
  })
  @ApiResponse({
    status: 200,
    description: 'QA panel updated and report email sent',
    type: QaPanelOtaPostResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid communication token' })
  @ApiResponse({ status: 404, description: 'QA panel not found' })
  async importCallback(
    @Body() body: QaPanelOtaPostImportCallbackDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const qaPanel = await this.qaPanelOtaPostService.processImportCallback(body);
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
  @ValidateBody(createQaPanelOtaPostSchema)
  @ApiOperation({ summary: 'Create a QA panel record' })
  @ApiResponse({
    status: 201,
    description: 'QA panel created successfully',
    type: QaPanelOtaPostResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async create(
    @Body() body: CreateQaPanelOtaPostDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const qaPanel = await this.qaPanelOtaPostService.createQaPanel(body);
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
  @ApiQuery({
    name: 'status',
    required: false,
    enum: QaPanelStatus,
    description: 'Filter by status (Processing, Success, Failed). Lowercase aliases are also accepted.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'], example: 'desc' })
  @ApiResponse({
    status: 200,
    description: 'QA panels retrieved successfully',
    type: QaPanelOtaPostListResponseDto,
  })
  async findAll(
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const parsedQuery = qaPanelOtaPostListQuerySchema.safeParse(query);

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

        const { search, status, page, limit, order } = parsedQuery.data;
        const filters: Record<string, unknown> = {};

        if (search) filters.search = search;
        if (status) filters.status = status;
        if (page) filters.page = page;
        if (limit) filters.limit = limit;
        if (order) filters.order = order;

        const result = await this.qaPanelOtaPostService.findAllQaPanels(filters as any);

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
  @ValidateBody(bulkDeleteQaPanelOtaPostSchema)
  @ApiOperation({ summary: 'Bulk delete QA panel records' })
  @ApiResponse({ status: 200, description: 'QA panels deleted successfully' })
  @ApiResponse({ status: 404, description: 'No QA panel records found' })
  async bulkDelete(
    @Body() body: BulkDeleteQaPanelOtaPostDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.qaPanelOtaPostService.bulkDeleteQaPanels(body.ids);
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
      'Uploads the file to S3, creates a QA panel record, forwards the file, qa_panel_id, and the authenticated user email to the dashboard proxy API, then returns the proxy response in data.',
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
    type: QaPanelOtaPostUploadApiResponseDto,
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
    @Req() req: { user?: { email?: string } },
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

        const email = req.user?.email;
        if (!email) {
          return {
            statusCode: 401,
            message: 'Authenticated user email not found in token',
            data: null,
          };
        }

        const proxyResponse = await this.qaPanelOtaPostService.uploadAndProcess(
          file,
          email,
        );
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

  @Get(':id([0-9a-fA-F]{24})')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get a QA panel record by ID' })
  @ApiParam({ name: 'id', description: 'QA panel ID' })
  @ApiResponse({
    status: 200,
    description: 'QA panel retrieved successfully',
    type: QaPanelOtaPostResponseDto,
  })
  @ApiResponse({ status: 404, description: 'QA panel not found' })
  async findById(
    @Param('id', MongoObjectIdPipe) id: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const qaPanel = await this.qaPanelOtaPostService.findQaPanelById(id);
        return {
          statusCode: 200,
          message: 'QA panel retrieved successfully',
          data: qaPanel,
        };
      },
      this.logger,
    );
  }

  @Put(':id([0-9a-fA-F]{24})')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ValidateBody(updateQaPanelOtaPostSchema)
  @ApiOperation({ summary: 'Update a QA panel record' })
  @ApiParam({ name: 'id', description: 'QA panel ID' })
  @ApiResponse({
    status: 200,
    description: 'QA panel updated successfully',
    type: QaPanelOtaPostResponseDto,
  })
  @ApiResponse({ status: 404, description: 'QA panel not found' })
  async update(
    @Param('id', MongoObjectIdPipe) id: string,
    @Body() body: UpdateQaPanelOtaPostDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const qaPanel = await this.qaPanelOtaPostService.updateQaPanel(id, body);
        return {
          statusCode: 200,
          message: 'QA panel updated successfully',
          data: qaPanel,
        };
      },
      this.logger,
    );
  }

  @Delete(':id([0-9a-fA-F]{24})')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a QA panel record' })
  @ApiParam({ name: 'id', description: 'QA panel ID' })
  @ApiResponse({ status: 200, description: 'QA panel deleted successfully' })
  @ApiResponse({ status: 404, description: 'QA panel not found' })
  async delete(
    @Param('id', MongoObjectIdPipe) id: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.qaPanelOtaPostService.deleteQaPanel(id);
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
