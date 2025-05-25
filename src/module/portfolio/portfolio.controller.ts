import {
  Body,
  ConsoleLogger,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Put,
  Query,
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
import { ResponseHandler } from 'src/common/utils/response-handler';
import { CreatePortfolioDto, UpdatePortfolioDto } from './portfolio.dto';
import { IPortfolioService } from './portfolio.interface';
import { ValidateBody } from 'src/common/decorators/validate.decorator';

import { createPortfolioSchema } from './portfolio.validation';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
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
  @ApiOperation({ summary: 'Create a new portfolio' })
  @ApiResponse({ status: 201, description: 'Portfolio created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ValidateBody(createPortfolioSchema)
  @UseGuards(JwtAuthGuard)
  async createPortfolio(
    @Req() request: Request,
    @Body() createPortfolioDto: CreatePortfolioDto,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      return ResponseHandler.handler(
        response,
        async () => {
          return {
            statusCode: 403,
            message: 'You are not authorized to create a portfolio',
            data: null,
          };
        },
        this.logger,
      );
    }
    return ResponseHandler.handler(
      response,
      async () => {
        const res =
          await this.portfolioService.createPortfolio(createPortfolioDto, user.userId);
        return {
          statusCode: 200,
          message: 'Portfolio created successfully',
          data: res,
        };
      },
      this.logger,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ParseQuery()
  @ApiOperation({ summary: 'Get all portfolios with filtering, sorting and pagination' })
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
  @ApiResponse({ status: 200, description: 'Returns list of portfolios' })
  async getAllPortfolios(
    @Req() request: Request,
    @Query() query: Record<string, any>,
    @Res() response: Response,
  ) {
    const { user } = request as any;
    console.log(user);
    let portfolios: any = [];
    if (user?.role !== 'admin') {
      portfolios = await this.portfolioService.getFilteredPortfolio(user?.userId);
    } else {
      portfolios = await this.portfolioService.getAllPortfolios(query);
    }
    return ResponseHandler.handler(
      response,
      async () => {
        return {
          statusCode: 200,
          message: 'Portfolios retrieved successfully',
          data: portfolios,
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
    @Res() response: Response
  ) {
    const { user } = request as any;
    if (user.role !== 'admin') {
      const permissionData = await this.portfolioService.getPermission(id, user.userId);
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
    if (user.role!== 'admin') {
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
          user.userId
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

  @Delete('/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete portfolio by ID' })
  @ApiResponse({ status: 200, description: 'Portfolio deleted successfully' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async deletePortfolio(
    @Req() request: Request,
    @Param('id') id: string,
    @Res() response: Response
  ) {
    const { user } = request as any;
    if (user.role!== 'admin') {
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
}
