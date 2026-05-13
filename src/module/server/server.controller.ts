import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  Logger,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { OtpPlatform } from '@prisma/client';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { IServerService } from './server.interface';
import {
  CreateServerDto,
  UpdateServerDto,
  BulkDeleteServerDto,
  ServerResponseDto,
  ServerListResponseDto,
} from './server.dto';
import {
  createServerSchema,
  updateServerSchema,
  bulkDeleteServerSchema,
} from './server.validation';

@ApiTags('Servers')
@ApiBearerAuth('JWT-auth')
@Controller('servers')
export class ServerController {
  private readonly logger = new Logger(ServerController.name);

  constructor(
    @Inject('IServerService')
    private readonly serverService: IServerService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Create a new server' })
  @ApiResponse({
    status: 201,
    description: 'Server created successfully',
    type: ServerResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 409, description: 'Server with same name already exists' })
  @ValidateBody(createServerSchema)
  async createServer(
    @Body() body: CreateServerDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const server = await this.serverService.createServer(body);
        return {
          statusCode: 201,
          message: 'Server created successfully',
          data: server,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Get all servers with pagination and filtering' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by server name or URL' })
  @ApiQuery({ name: 'platform', required: false, enum: ['expedia', 'agoda', 'booking', 'expedia_retrieval', 'agoda_retrieval', 'expedia_db'], description: 'Filter by platform' })
  @ApiQuery({ name: 'is_active', required: false, type: Boolean, description: 'Filter by active status' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page', example: 10 })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'], description: 'Sort order', example: 'desc' })
  @ApiResponse({
    status: 200,
    description: 'Servers retrieved successfully',
    type: ServerListResponseDto,
  })
  async findAllServers(
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const filters: any = {};
        
        const { search, platform, is_active, page, limit, order } = query;
        
        if (search) filters.search = search;
        if (platform) filters.platform = platform;
        if (is_active !== undefined) filters.is_active = is_active === 'true';
        if (page) filters.page = page;
        if (limit) filters.limit = limit;
        if (order) filters.order = order;

        const result = await this.serverService.findAllServers(filters);

        return {
          statusCode: 200,
          message: 'Servers retrieved successfully',
          data: result.servers,
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

  @UseGuards(JwtAuthGuard)
  @Get('/available')
  @ApiOperation({ summary: 'Get an available server (with job_count < 200)' })
  @ApiResponse({
    status: 200,
    description: 'Available server retrieved successfully',
    type: ServerResponseDto,
  })
  @ApiResponse({ status: 404, description: 'No available server found' })
  async findAvailableServer(@Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const server = await this.serverService.findAvailableServer();

        if (!server) {
          return {
            statusCode: 404,
            message: 'No available server found',
            data: null,
          };
        }

        return {
          statusCode: 200,
          message: 'Available server retrieved successfully',
          data: server,
        };
      },
      this.logger,
    );
  }

  @Get('/available/by-platform')
  @ApiOperation({ summary: 'Get an available server by platform (public endpoint)' })
  @ApiQuery({ 
    name: 'platform', 
    required: true, 
    enum: ['expedia', 'agoda', 'booking', 'expedia_retrieval', 'agoda_retrieval', 'expedia_db'], 
    description: 'Platform to filter servers by' 
  })
  @ApiResponse({
    status: 200,
    description: 'Available server retrieved successfully (sorted by lowest job_count)',
    type: ServerResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid or missing platform parameter' })
  @ApiResponse({ status: 404, description: 'No available server found for the platform' })
  async findAvailableServerByPlatform(
    @Query('platform') platform: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        if (!platform) {
          return {
            statusCode: 400,
            message: 'Platform parameter is required',
            data: null,
          };
        }

        const validPlatforms = ['expedia', 'agoda', 'booking', 'expedia_retrieval', 'agoda_retrieval', 'expedia_db'];
        if (!validPlatforms.includes(platform)) {
          return {
            statusCode: 400,
            message: `Invalid platform. Valid platforms are: ${validPlatforms.join(', ')}`,
            data: null,
          };
        }

        const server = await this.serverService.findAvailableServerByPlatform(platform as OtpPlatform);

        if (!server) {
          return {
            statusCode: 404,
            message: `No available server found for platform "${platform}"`,
            data: null,
          };
        }

        return {
          statusCode: 200,
          message: 'Available server retrieved successfully',
          data: server,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get a server by ID' })
  @ApiParam({ name: 'id', description: 'Server ID' })
  @ApiResponse({
    status: 200,
    description: 'Server retrieved successfully',
    type: ServerResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Server not found' })
  async findServerById(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const server = await this.serverService.findServerById(id);
        return {
          statusCode: 200,
          message: 'Server retrieved successfully',
          data: server,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @ApiOperation({ summary: 'Update a server' })
  @ApiParam({ name: 'id', description: 'Server ID' })
  @ApiResponse({
    status: 200,
    description: 'Server updated successfully',
    type: ServerResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Server not found' })
  @ApiResponse({ status: 409, description: 'Server with same name already exists' })
  @ValidateBody(updateServerSchema)
  async updateServer(
    @Param('id') id: string,
    @Body() body: UpdateServerDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const server = await this.serverService.updateServer(id, body);
        return {
          statusCode: 200,
          message: 'Server updated successfully',
          data: server,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a server' })
  @ApiParam({ name: 'id', description: 'Server ID' })
  @ApiResponse({
    status: 200,
    description: 'Server deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Server not found' })
  @ApiResponse({ status: 400, description: 'Cannot delete server with active jobs' })
  async deleteServer(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.serverService.deleteServer(id);
        return {
          statusCode: 200,
          message: 'Server deleted successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('/bulk-delete')
  @ApiOperation({ summary: 'Bulk delete servers' })
  @ApiResponse({
    status: 200,
    description: 'Servers deleted successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request or servers have active jobs' })
  @ValidateBody(bulkDeleteServerSchema)
  async bulkDeleteServers(
    @Body() body: BulkDeleteServerDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.serverService.bulkDeleteServers(body.ids);
        return {
          statusCode: 200,
          message: `Successfully deleted ${result.deletedCount} server(s)`,
          data: result,
        };
      },
      this.logger,
    );
  }
}
