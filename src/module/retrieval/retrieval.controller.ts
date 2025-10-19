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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ExcelFileInterceptorOptions } from '../../common/interceptors/excel-file.interceptor';
import { ResponseHandler } from '../../common/utils/response-handler';
import {
  CreateParentRetrievalDto,
  CreateRetrievalDto,
  UpdateRetrievalDto,
  UploadRetrievalResponseDto,
} from './retrieval.dto';
import { IRetrievalService } from './retrieval.interface';
import {
  createParentRetrievalSchema,
  createRetrievalSchema,
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
}
