import {
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
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
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IDbDataService } from './db-data.interface';

@ApiTags('DbData')
@ApiBearerAuth('JWT-auth')
@Controller('/db-data')
export class DbDataController {
  constructor(
    @Inject('IDbDataService')
    private readonly dbDataService: IDbDataService,
    private readonly logger: Logger,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all DbData with filters' })
  @ApiResponse({ status: 200, description: 'Returns list of DbData' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by property name or property ID',
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
    description: 'Start date for filtering by created_at',
  })
  @ApiQuery({
    name: 'end_date',
    required: false,
    description: 'End date for filtering by created_at',
  })
  @ApiQuery({
    name: 'job_id',
    required: false,
    description: 'Filter by job ID',
  })
  @ApiQuery({
    name: 'property_id',
    required: false,
    description: 'Filter by property ID',
  })
  @ApiQuery({
    name: 'property_name',
    required: false,
    description: 'Filter by property name (partial match)',
  })
  async getAllDbData(
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.dbDataService.getAllDbData(query);
        return {
          statusCode: 200,
          message: 'DbData retrieved successfully',
          data: result.data,
          metadata: result.metadata,
        };
      },
      this.logger,
    );
  }

  @Get('/job/:job_id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all DbData by job ID (no pagination)' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of DbData for the job',
  })
  async getAllDbDataByJobId(
    @Param('job_id') jobId: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const dbData = await this.dbDataService.getAllDbDataByJobId(jobId);
        return {
          statusCode: 200,
          message: 'DbData retrieved successfully',
          data: dbData,
        };
      },
      this.logger,
    );
  }

  @Get('/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get DbData by ID' })
  @ApiResponse({ status: 200, description: 'Returns a DbData' })
  @ApiResponse({ status: 404, description: 'DbData not found' })
  async getDbDataById(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const dbData = await this.dbDataService.getDbDataById(id);
        return {
          statusCode: 200,
          message: 'DbData retrieved successfully',
          data: dbData,
        };
      },
      this.logger,
    );
  }

  @Delete('/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete DbData by ID' })
  @ApiResponse({ status: 200, description: 'DbData deleted successfully' })
  @ApiResponse({ status: 404, description: 'DbData not found' })
  async deleteDbData(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        await this.dbDataService.deleteDbData(id);
        return {
          statusCode: 200,
          message: 'DbData deleted successfully',
          data: null,
        };
      },
      this.logger,
    );
  }
}
