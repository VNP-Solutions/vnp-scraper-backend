import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  Patch,
  Post,
  Req,
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
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateSubPortfolioDto,
  UpdateSubPortfolioDto,
} from './sub-portfolio.dto';
import { ISubPortfolioService } from './sub-portfolio.interface';
import {
  createSubPortfolioSchema,
  updateSubPortfolioSchema,
} from './sub-portfolio.validation';

@ApiTags('Sub-Portfolios')
@ApiBearerAuth('JWT-auth')
@Controller('/sub-portfolio')
export class SubPortfolioController {
  constructor(
    @Inject('ISubPortfolioService')
    private readonly subPortfolioService: ISubPortfolioService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new sub-portfolio' })
  @ApiResponse({
    status: 201,
    description: 'Sub-portfolio created successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ValidateBody(createSubPortfolioSchema)
  @UseGuards(JwtAuthGuard)
  async createSubPortfolio(
    @Req() request: Request,
    @Body() createSubPortfolioDto: CreateSubPortfolioDto,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to create a sub-portfolio',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      response,
      async () => {
        const res = await this.subPortfolioService.createSubPortfolio(
          createSubPortfolioDto,
        );
        return {
          statusCode: 201,
          message: 'Sub-portfolio created successfully',
          data: res,
        };
      },
      this.logger,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all sub-portfolios with optional query' })
  @ApiResponse({ status: 200, description: 'Returns list of sub-portfolios' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search sub-portfolios by name or description',
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
  @ApiQuery({
    name: 'portfolio_id',
    required: false,
    description: 'Portfolio ID for filtering',
  })
  @UseGuards(JwtAuthGuard)
  async getAllSubPortfolios(
    @Req() request: Request,
    @ParseQuery() query: Record<string, any>,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    let subPortfolios: any[] = [];
    let metadata: any = {};
    if (user.role !== 'admin') {
      const result = await this.subPortfolioService.getFilteredSubPortfolios(
        user.userId,
        query,
      );
      subPortfolios = result.data;
      metadata = result.metadata;
    } else {
      const result = await this.subPortfolioService.getAllSubPortfolios(query);
      subPortfolios = result.data;
      metadata = result.metadata;
    }
    return ResponseHandler.handler(
      response,
      async () => {
        return {
          statusCode: 200,
          message: 'Sub-portfolios retrieved successfully',
          data: subPortfolios,
          metadata,
        };
      },
      this.logger,
    );
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Get sub-portfolio by ID' })
  @ApiResponse({ status: 200, description: 'Returns a sub-portfolio' })
  @ApiResponse({ status: 404, description: 'Sub-portfolio not found' })
  @UseGuards(JwtAuthGuard)
  async getSubPortfolioById(
    @Req() request: Request,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      const permissionData = await this.subPortfolioService.getPermission(
        id,
        user.userId,
      );
      if (!permissionData) {
        return ResponseHandler.handler(
          response,
          async () => {
            return {
              statusCode: 403,
              message: 'You are not authorized to get this sub-portfolio',
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
        const subPortfolio =
          await this.subPortfolioService.getSubPortfolioById(id);
        return {
          statusCode: 200,
          message: 'Sub-portfolio retrieved successfully',
          data: subPortfolio,
        };
      },
      this.logger,
    );
  }

  @Get('/portfolio/:portfolioId')
  @ApiOperation({ summary: 'Get sub-portfolios by portfolio ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of sub-portfolios for a portfolio',
  })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  @UseGuards(JwtAuthGuard)
  async getSubPortfoliosByPortfolioId(
    @Req() request: Request,
    @Param('portfolioId') portfolioId: string,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      const permissionData =
        await this.subPortfolioService.getPermissionByPortfolioId(
          portfolioId,
          user.userId,
        );
      if (!permissionData) {
        return ResponseHandler.handler(
          response,
          async () => {
            return {
              statusCode: 403,
              message: 'You are not authorized to get this sub-portfolio',
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
        const subPortfolios =
          await this.subPortfolioService.findSubPortfoliosByPortfolioId(
            portfolioId,
          );
        return {
          statusCode: 200,
          message: 'Sub-portfolios retrieved successfully',
          data: subPortfolios,
        };
      },
      this.logger,
    );
  }

  @Patch('/:id')
  @ApiOperation({ summary: 'Update sub-portfolio by ID' })
  @ApiResponse({
    status: 200,
    description: 'Sub-portfolio updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Sub-portfolio not found' })
  @ValidateBody(updateSubPortfolioSchema)
  @UseGuards(JwtAuthGuard)
  async updateSubPortfolio(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() updateSubPortfolioDto: UpdateSubPortfolioDto,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to update this sub-portfolio',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      response,
      async () => {
        const subPortfolio = await this.subPortfolioService.updateSubPortfolio(
          id,
          updateSubPortfolioDto,
        );
        return {
          statusCode: 200,
          message: 'Sub-portfolio updated successfully',
          data: subPortfolio,
        };
      },
      this.logger,
    );
  }

  @Delete('/:id')
  @ApiOperation({ summary: 'Delete sub-portfolio by ID' })
  @ApiResponse({
    status: 200,
    description: 'Sub-portfolio deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Sub-portfolio not found' })
  @UseGuards(JwtAuthGuard)
  async deleteSubPortfolio(
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
            message: 'You are not authorized to delete this sub-portfolio',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      response,
      async () => {
        const subPortfolio =
          await this.subPortfolioService.deleteSubPortfolio(id);
        return {
          statusCode: 200,
          message: 'Sub-portfolio deleted successfully',
          data: subPortfolio,
        };
      },
      this.logger,
    );
  }
}
