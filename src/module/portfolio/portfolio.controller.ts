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
  async createPortfolio(
    @Body() createPortfolioDto: CreatePortfolioDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const res =
          await this.portfolioService.createPortfolio(createPortfolioDto);
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
  @ApiOperation({ summary: 'Get all portfolios with optional name filter' })
  @ApiQuery({
    name: 'name',
    required: false,
    description: 'Filter portfolios by name',
  })
  @ApiResponse({ status: 200, description: 'Returns list of portfolios' })
  async getAllPortfolios(
    @Query('name') name: string = '',
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const portfolios = await this.portfolioService.getAllPortfolios(name);
        return {
          statusCode: 200,
          message: 'Portfolios retrieved successfully',
          data: portfolios,
        };
      },
      this.logger,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get portfolio by ID' })
  @ApiResponse({ status: 200, description: 'Returns a portfolio' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPortfolioById(@Param('id') id: string, @Res() response: Response) {
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

  @Put(':id')
  @ApiOperation({ summary: 'Update portfolio by ID' })
  @ApiResponse({ status: 200, description: 'Portfolio updated successfully' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async updatePortfolio(
    @Param('id') id: string,
    @Body() updatePortfolioDto: UpdatePortfolioDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const portfolio = await this.portfolioService.updatePortfolio(
          id,
          updatePortfolioDto,
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

  @Delete(':id')
  @ApiOperation({ summary: 'Delete portfolio by ID' })
  @ApiResponse({ status: 200, description: 'Portfolio deleted successfully' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async deletePortfolio(@Param('id') id: string, @Res() response: Response) {
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
