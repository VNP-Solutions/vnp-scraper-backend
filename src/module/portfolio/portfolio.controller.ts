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
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { creationDisabledMessage } from 'src/common/constants/dbms-sync.constants';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { IPortfolioService } from './portfolio.interface';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ServiceTokenGuard } from '../property/guards/service-token';
import {
  SyncBulkUpsertPortfolioDto,
  SyncCreatePortfolioDto,
  SyncDeleteByParentPortfolioDto,
  SyncDeletePortfolioDto,
  SyncUpdatePortfolioDto,
  SyncUpsertPortfolioDto,
  UpdatePortfolioDto,
} from './portfolio.dto';
import { ExternalJwtGuard } from '../qa-panel/guards/external-jwt.guard';

@ApiTags('Portfolios')
@ApiBearerAuth('JWT-auth')
@Controller('/portfolios')
export class PortfolioController {
  constructor(
    @Inject('IPortfolioService')
    private readonly portfolioService: IPortfolioService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Disabled - portfolios are created in DBMS and synced here',
  })
  @ApiResponse({
    status: 403,
    description: 'Portfolio creation is only possible through DBMS sync',
  })
  @UseGuards(JwtAuthGuard)
  async createPortfolio(@Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        return {
          statusCode: 403,
          message: creationDisabledMessage('Portfolios'),
          data: null,
        };
      },
      this.logger,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get all portfolios with filtering, sorting and pagination',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search portfolios by name',
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
    description: 'Start date for filtering',
  })
  @ApiQuery({
    name: 'end_date',
    required: false,
    description: 'End date for filtering',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns list of portfolios with metadata',
  })
  async getAllPortfolios(
    @Req() request: Request,
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    let result: any;
    if (user?.role !== 'admin') {
      result = await this.portfolioService.getFilteredPortfolio(user?.userId);
    } else {
      result = await this.portfolioService.getAllPortfolios(query);
    }
    return ResponseHandler.handler(
      response,
      async () => {
        return {
          statusCode: 200,
          message: 'Portfolios retrieved successfully',
          data: result.data,
          metadata: result.metadata,
        };
      },
      this.logger,
    );
  }

  @Get('/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get portfolio by ID' })
  @ApiResponse({ status: 200, description: 'Returns a portfolio' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPortfolioById(
    @Req() request: Request,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      const permissionData = await this.portfolioService.getPermission(
        id,
        user.userId,
      );
      if (!permissionData) {
        return ResponseHandler.handler(
          response,
          async () => {
            return {
              statusCode: 403,
              message: 'You are not authorized to access this portfolio',
              data: null,
            };
          },
          this.logger,
        );
      }
    }
    return ResponseHandler.handler(
      response,
      async () => {
        const portfolio = await this.portfolioService.getPortfolioById(id);
        return {
          statusCode: 200,
          message: 'Portfolio retrieved successfully',
          data: portfolio,
        };
      },
      this.logger,
    );
  }

  @Put('/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update portfolio by ID' })
  @ApiResponse({ status: 200, description: 'Portfolio updated successfully' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async updatePortfolio(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() updatePortfolioDto: UpdatePortfolioDto,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to update this portfolio',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      response,
      async () => {
        const portfolio = await this.portfolioService.updatePortfolio(
          id,
          updatePortfolioDto,
          user.userId,
        );
        return {
          statusCode: 200,
          message: 'Portfolio updated successfully',
          data: portfolio,
        };
      },
      this.logger,
    );
  }

  @Post('/sync-bulk-upsert')
  @UseGuards(ExternalJwtGuard)
  @ApiOperation({
    summary:
      'Internal: bulk upsert portfolios synced from DBMS (parent_id keyed)',
  })
  @ApiBody({ type: SyncBulkUpsertPortfolioDto })
  async syncBulkUpsert(
    @Body() dto: SyncBulkUpsertPortfolioDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => ({
        statusCode: 200,
        message: 'Sync bulk upsert processed',
        data: await this.portfolioService.syncBulkUpsert(dto.items ?? []),
      }),
      this.logger,
    );
  }

  @Post('/sync-upsert/:parent_id')
  @UseGuards(ExternalJwtGuard)
  @ApiOperation({
    summary: 'Internal: upsert a portfolio synced from DBMS (parent_id keyed)',
  })
  @ApiBody({ type: SyncUpsertPortfolioDto })
  async syncUpsert(
    @Param('parent_id') parentId: string,
    @Body() dto: SyncUpsertPortfolioDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.portfolioService.syncUpsert(
          parentId,
          dto.name,
        );
        return {
          statusCode: 200,
          message: `Portfolio ${result.action} successfully`,
          data: result.portfolio,
        };
      },
      this.logger,
    );
  }

  @Delete('/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete portfolio by ID' })
  @ApiResponse({ status: 200, description: 'Portfolio deleted successfully' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async deletePortfolio(
    @Req() request: Request,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to delete this portfolio',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      response,
      async () => {
        await this.portfolioService.deletePortfolio(id);
        return {
          statusCode: 200,
          message: 'Portfolio deleted successfully',
          data: null,
        };
      },
      this.logger,
    );
  }

  @Post('/sync-delete')
  @UseGuards(ServiceTokenGuard)
  @ApiOperation({
    summary:
      'Internal: delete portfolio synced from DBMS (reassigns properties to Internal)',
  })
  async syncDelete(
    @Body() dto: SyncDeletePortfolioDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => ({
        statusCode: 200,
        message: 'Sync delete processed',
        data: await this.portfolioService.syncDelete(dto.name),
      }),
      this.logger,
    );
  }

  @Post('/sync-delete/:parent_id')
  @UseGuards(ExternalJwtGuard)
  @ApiOperation({
    summary:
      'Internal: delete a portfolio synced from DBMS (parent_id keyed, reassigns properties to Internal)',
  })
  async syncDeleteByParent(
    @Param('parent_id') parentId: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => ({
        statusCode: 200,
        message: 'Portfolio deleted successfully',
        data: await this.portfolioService.syncDeleteByParentId(parentId),
      }),
      this.logger,
    );
  }

  @Post('/sync-create')
  @UseGuards(ServiceTokenGuard)
  @ApiOperation({ summary: 'Internal: create portfolio synced from DBMS' })
  async syncCreate(
    @Body() dto: SyncCreatePortfolioDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => ({
        statusCode: 201,
        message: 'Sync create processed',
        data: await this.portfolioService.syncCreate(dto.name, dto._id),
      }),
      this.logger,
    );
  }

  @Post('/sync-update')
  @UseGuards(ServiceTokenGuard)
  @ApiOperation({
    summary: 'Internal: update (rename) portfolio synced from DBMS',
  })
  async syncUpdate(
    @Body() dto: SyncUpdatePortfolioDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => ({
        statusCode: 200,
        message: 'Sync update processed',
        data: await this.portfolioService.syncUpdate(dto.oldName, dto.newName),
      }),
      this.logger,
    );
  }
}
