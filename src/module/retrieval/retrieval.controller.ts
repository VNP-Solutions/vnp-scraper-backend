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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ExcelFileInterceptorOptions } from '../../common/interceptors/excel-file.interceptor';
import { ResponseHandler } from '../../common/utils/response-handler';
import {
  BulkRetrievalBatchUpdateDto,
  BulkRetrievalBatchUpdateResponseDto,
  CreateParentRetrievalDto,
  CreateRetrievalDto,
  UpdateParentRetrievalDto,
  UpdateRetrievalDto,
  UploadRetrievalResponseDto,
} from './retrieval.dto';
import { IRetrievalService } from './retrieval.interface';
import {
  createParentRetrievalSchema,
  createRetrievalSchema,
  updateParentRetrievalSchema,
  updateRetrievalSchema,
} from './retrieval.validation';

@ApiTags('Retrieval')
@Controller('/retrieval')
export class RetrievalController {
  constructor(
    @Inject('IRetrievalService')
    private readonly retrievalService: IRetrievalService,
    private readonly logger: Logger,
  ) {}

  @Post('/upload')
  @ApiOperation({ summary: 'Upload Excel file to create retrievals' })
  @ApiResponse({
    status: 201,
    description: 'Retrievals created successfully',
    type: UploadRetrievalResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file or data' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        userId: {
          type: 'string',
          description: 'User ID who is uploading the file',
        },
      },
    },
  })
  @UseInterceptors(ExcelFileInterceptorOptions.create('file'))
  async uploadRetrievalExcel(
    @UploadedFile() file: Express.Multer.File,
    @Body('userId') userId: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        if (!userId) {
          throw new Error('userId is required');
        }

        const result = await this.retrievalService.uploadRetrievalExcel(
          file,
          userId,
        );

        return {
          statusCode: 201,
          message:
            result.failedCount > 0
              ? `Retrievals processed with ${result.failedCount} failure(s)`
              : 'Retrievals created successfully',
          data: {
            parentRetrieval: result.parentRetrieval,
            retrievalsCreated: result.successCount,
            retrievalItemsCreated: result.retrievalItemsCount,
            retrievalsFailed: result.failedCount,
            failedHotelIds: result.failedHotelIds,
            retrievals: result.retrievals,
          },
        };
      },
      this.logger,
    );
  }

  @Post('/parent')
  @ApiOperation({ summary: 'Create a parent retrieval' })
  @ApiResponse({
    status: 201,
    description: 'Parent retrieval created successfully',
  })
  @ValidateBody(createParentRetrievalSchema)
  async createParentRetrieval(
    @Body() data: CreateParentRetrievalDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const parentRetrieval =
          await this.retrievalService.createParentRetrieval(data);
        return {
          statusCode: 201,
          message: 'Parent retrieval created successfully',
          data: parentRetrieval,
        };
      },
      this.logger,
    );
  }

  @Get('/parent')
  @ApiOperation({ summary: 'Get all parent retrievals' })
  @ApiResponse({
    status: 200,
    description: 'Parent retrievals retrieved successfully',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search parent retrievals by name or ID',
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
    description:
      'Field to sort by (available fields: id, name, ota_provider, createdAt, updatedAt)',
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
    description: 'Start date for filtering (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'end_date',
    required: false,
    description: 'End date for filtering (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'is_archived',
    required: false,
    type: 'boolean',
    description: 'Filter parent retrievals by archived status (true/false)',
  })
  @ApiQuery({
    name: 'ota_provider',
    required: false,
    description: 'Filter by OTA provider (Expedia, Booking, Agoda)',
  })
  async getAllParentRetrievals(
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result =
          await this.retrievalService.getAllParentRetrievals(query);
        return {
          statusCode: 200,
          message: 'Parent retrievals retrieved successfully',
          data: result.data,
          metadata: result.metadata,
        };
      },
      this.logger,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a retrieval' })
  @ApiResponse({ status: 201, description: 'Retrieval created successfully' })
  @ValidateBody(createRetrievalSchema)
  async createRetrieval(
    @Body() data: CreateRetrievalDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const retrieval = await this.retrievalService.createRetrieval(data);
        return {
          statusCode: 201,
          message: 'Retrieval created successfully',
          data: retrieval,
        };
      },
      this.logger,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all retrievals' })
  @ApiResponse({
    status: 200,
    description: 'Retrievals retrieved successfully',
  })
  @ApiQuery({
    name: 'is_archived',
    required: false,
    type: 'boolean',
    description: 'Filter retrievals by archived status (true/false)',
  })
  async getAllRetrievals(
    @Query() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.retrievalService.getAllRetrievals(query);
        return {
          statusCode: 200,
          message: 'Retrievals retrieved successfully',
          data: result.data,
          metadata: result.metadata,
        };
      },
      this.logger,
    );
  }

  @Get('/parent/:id')
  @ApiOperation({ summary: 'Get parent retrieval by ID' })
  @ApiResponse({
    status: 200,
    description: 'Parent retrieval retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Parent retrieval not found' })
  async getParentRetrievalById(
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const parentRetrieval =
          await this.retrievalService.getParentRetrievalById(id);
        return {
          statusCode: 200,
          message: 'Parent retrieval retrieved successfully',
          data: parentRetrieval,
        };
      },
      this.logger,
    );
  }

  @Put('/parent/:id')
  @ApiOperation({ summary: 'Update parent retrieval by ID' })
  @ApiResponse({
    status: 200,
    description: 'Parent retrieval updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Parent retrieval not found' })
  @ValidateBody(updateParentRetrievalSchema)
  async updateParentRetrieval(
    @Param('id') id: string,
    @Body() data: UpdateParentRetrievalDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const parentRetrieval =
          await this.retrievalService.updateParentRetrieval(id, data);
        return {
          statusCode: 200,
          message: 'Parent retrieval updated successfully',
          data: parentRetrieval,
        };
      },
      this.logger,
    );
  }

  @Get('/parent/:parentRetrievalId/retrievals')
  @ApiOperation({ summary: 'Get retrievals by parent retrieval ID' })
  @ApiResponse({
    status: 200,
    description: 'Retrievals retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Parent retrieval not found' })
  @ApiQuery({
    name: 'search',
    required: false,
    description:
      'Search retrievals by retrieval ID, name, portfolio name, sub-portfolio name, property name, or OTA provider',
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
    description:
      'Field to sort by (e.g., name, createdAt, updatedAt, job_status, property_name)',
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
    description: 'Start date for filtering (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'end_date',
    required: false,
    description: 'End date for filtering (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'job_status',
    required: false,
    description:
      'Filter by job status (e.g., Pending, Running, Completed, Failed, Stopped)',
  })
  @ApiQuery({
    name: 'ota_provider',
    required: false,
    description: 'Filter by OTA provider (Expedia, Booking, Agoda)',
  })
  @ApiQuery({
    name: 'posting_type',
    required: false,
    description: 'Filter by posting type (OTA, OTA_PLUS)',
  })
  @ApiQuery({
    name: 'property_id',
    required: false,
    description: 'Filter by property ID',
  })
  @ApiQuery({
    name: 'portfolio_id',
    required: false,
    description: 'Filter by portfolio ID',
  })
  @ApiQuery({
    name: 'sub_portfolio_id',
    required: false,
    description: 'Filter by sub-portfolio ID',
  })
  @ApiQuery({
    name: 'property_name',
    required: false,
    description: 'Filter by property name (partial match)',
  })
  @ApiQuery({
    name: 'portfolio_name',
    required: false,
    description: 'Filter by portfolio name (partial match)',
  })
  @ApiQuery({
    name: 'sub_portfolio_name',
    required: false,
    description: 'Filter by sub-portfolio name (partial match)',
  })
  @ApiQuery({
    name: 'batch_id',
    required: false,
    description: 'Filter by batch ID',
  })
  @ApiQuery({
    name: 'is_archived',
    required: false,
    type: Boolean,
    description: 'Filter retrievals by archived status (true/false)',
  })
  async getRetrievalsByParentRetrievalId(
    @Param('parentRetrievalId') parentRetrievalId: string,
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result =
          await this.retrievalService.getRetrievalsByParentRetrievalId(
            parentRetrievalId,
            query,
          );
        return {
          statusCode: 200,
          message: 'Retrievals retrieved successfully',
          data: result.data,
          metadata: result.metadata,
        };
      },
      this.logger,
    );
  }

  @Get('/export/:parentRetrievalId')
  @ApiOperation({
    summary: 'Export retrieval items to Excel by parent retrieval ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Excel file generated successfully',
  })
  @ApiResponse({ status: 404, description: 'Parent retrieval not found' })
  async exportRetrievalItems(
    @Param('parentRetrievalId') parentRetrievalId: string,
    @Res() response: Response,
  ) {
    try {
      const parentRetrieval =
        await this.retrievalService.getParentRetrievalById(parentRetrievalId);

      const buffer =
        await this.retrievalService.exportRetrievalItemsToExcel(
          parentRetrievalId,
        );

      const fileName = `${parentRetrieval.name}.xlsx`;

      response.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`,
      );
      response.send(buffer);
    } catch (error) {
      this.logger.error(
        `Error exporting retrieval items: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Get retrieval by ID' })
  @ApiResponse({
    status: 200,
    description: 'Retrieval retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Retrieval not found' })
  async getRetrievalById(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const retrieval = await this.retrievalService.getRetrievalById(id);
        return {
          statusCode: 200,
          message: 'Retrieval retrieved successfully',
          data: retrieval,
        };
      },
      this.logger,
    );
  }

  @Get('/:retrievalId/items')
  @ApiOperation({ summary: 'Get retrieval items by retrieval ID' })
  @ApiResponse({
    status: 200,
    description: 'Retrieval items retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Retrieval not found' })
  @ApiQuery({
    name: 'search',
    required: false,
    description:
      'Search retrieval items by reservation ID, guest name, or confirmation number',
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
    description:
      'Field to sort by (e.g., createdAt, reservation_id, guest_name, check_in_date, booking_amount)',
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
    description: 'Start date for check-in filtering (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'end_date',
    required: false,
    description: 'End date for check-in filtering (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'reservation_status',
    required: false,
    description: 'Filter by reservation status',
  })
  async getRetrievalItemsByRetrievalId(
    @Param('retrievalId') retrievalId: string,
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result =
          await this.retrievalService.getRetrievalItemsByRetrievalId(
            retrievalId,
            query,
          );
        return {
          statusCode: 200,
          message: 'Retrieval items retrieved successfully',
          data: result.data,
          metadata: result.metadata,
        };
      },
      this.logger,
    );
  }

  @Put('/:id')
  @ApiOperation({ summary: 'Update retrieval by ID' })
  @ApiResponse({ status: 200, description: 'Retrieval updated successfully' })
  @ApiResponse({ status: 404, description: 'Retrieval not found' })
  @ValidateBody(updateRetrievalSchema)
  async updateRetrieval(
    @Param('id') id: string,
    @Body() data: UpdateRetrievalDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const retrieval = await this.retrievalService.updateRetrieval(id, data);
        return {
          statusCode: 200,
          message: 'Retrieval updated successfully',
          data: retrieval,
        };
      },
      this.logger,
    );
  }

  @Delete('/:id')
  @ApiOperation({ summary: 'Delete retrieval by ID' })
  @ApiResponse({
    status: 200,
    description: 'Retrieval deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Retrieval not found' })
  async deleteRetrieval(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        await this.retrievalService.deleteRetrieval(id);
        return {
          statusCode: 200,
          message: 'Retrieval deleted successfully',
          data: null,
        };
      },
      this.logger,
    );
  }

  @Delete('/parent/:id')
  @ApiOperation({ summary: 'Delete parent retrieval by ID' })
  @ApiResponse({
    status: 200,
    description: 'Parent retrieval deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Parent retrieval not found' })
  async deleteParentRetrieval(
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        await this.retrievalService.deleteParentRetrieval(id);
        return {
          statusCode: 200,
          message: 'Parent retrieval deleted successfully',
          data: null,
        };
      },
      this.logger,
    );
  }

  @Post('/bulk_batch_update')
  @ApiOperation({ summary: 'Bulk update retrievals with batch ID' })
  @ApiResponse({
    status: 200,
    description: 'Retrievals updated successfully',
    type: BulkRetrievalBatchUpdateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid input' })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  async bulkBatchUpdate(
    @Body() bulkBatchUpdateDto: BulkRetrievalBatchUpdateDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.retrievalService.bulkBatchUpdate(
          bulkBatchUpdateDto.retrieval_ids,
          bulkBatchUpdateDto.batch_id,
        );
        return {
          statusCode: 200,
          message: 'Retrievals updated successfully',
          data: result,
        };
      },
      this.logger,
    );
  }
}
