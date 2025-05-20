import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Res,
  Inject,
  Logger,
  Query,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { CreateSubPortfolioDto, UpdateSubPortfolioDto } from './sub-portfolio.dto';
import { ISubPortfolioService } from './sub-portfolio.interface';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { createSubPortfolioSchema, updateSubPortfolioSchema } from './sub-portfolio.validation';

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
  @ApiResponse({ status: 201, description: 'Sub-portfolio created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ValidateBody(createSubPortfolioSchema)
  async createSubPortfolio(
    @Body() createSubPortfolioDto: CreateSubPortfolioDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const res = await this.subPortfolioService.createSubPortfolio(createSubPortfolioDto);
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
    name: 'query',
    required: false,
    description: 'Search query for filtering sub-portfolios',
  })
  async getAllSubPortfolios(
    @Query('query') query: string = '',
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const subPortfolios = await this.subPortfolioService.getAllSubPortfolios(query);
        return {
          statusCode: 200,
          message: 'Sub-portfolios retrieved successfully',
          data: subPortfolios,
        };
      },
      this.logger,
    );
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Get sub-portfolio by ID' })
  @ApiResponse({ status: 200, description: 'Returns a sub-portfolio' })
  @ApiResponse({ status: 404, description: 'Sub-portfolio not found' })
  async getSubPortfolioById(
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const subPortfolio = await this.subPortfolioService.getSubPortfolioById(id);
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
  @ApiResponse({ status: 200, description: 'Returns list of sub-portfolios for a portfolio' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getSubPortfoliosByPortfolioId(
    @Param('portfolioId') portfolioId: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const subPortfolios = await this.subPortfolioService.findSubPortfoliosByPortfolioId(portfolioId);
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
  @ApiResponse({ status: 200, description: 'Sub-portfolio updated successfully' })
  @ApiResponse({ status: 404, description: 'Sub-portfolio not found' })
  @ValidateBody(updateSubPortfolioSchema)
  async updateSubPortfolio(
    @Param('id') id: string,
    @Body() updateSubPortfolioDto: UpdateSubPortfolioDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const subPortfolio = await this.subPortfolioService.updateSubPortfolio(id, updateSubPortfolioDto);
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
  @ApiResponse({ status: 200, description: 'Sub-portfolio deleted successfully' })
  @ApiResponse({ status: 404, description: 'Sub-portfolio not found' })
  async deleteSubPortfolio(
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const subPortfolio = await this.subPortfolioService.deleteSubPortfolio(id);
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
