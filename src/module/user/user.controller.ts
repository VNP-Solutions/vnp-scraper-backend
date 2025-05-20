import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  Res,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { CreateUserDto, UpdateUserDto } from './user.dto';
import { IUserService } from './user.interface';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('/user')
export class UserController {
  constructor(
    @Inject('IUserService')
    private readonly userService: IUserService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createUser(
    @Body() createUserDto: CreateUserDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const res = await this.userService.createUser(createUserDto);
        return {
          statusCode: 200,
          message: 'User created successfully',
          data: res,
        };
      },
      this.logger,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Get all users with optional search query' })
  @ApiQuery({
    name: 'query',
    required: false,
    description: 'Search query for filtering users',
  })
  @ApiResponse({ status: 200, description: 'Returns list of users' })
  async getAllUsers(
    @Query('query') query: string = '',
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const users = await this.userService.getAllUsers(query);
        return {
          statusCode: 200,
          message: 'Users retrieved successfully',
          data: users,
        };
      },
      this.logger,
    );
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'Returns a user' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const user = await this.userService.getUserById(id);
        return {
          statusCode: 200,
          message: 'User retrieved successfully',
          data: user,
        };
      },
      this.logger,
    );
  }

  @Patch('/:id')
  @ApiOperation({ summary: 'Update user by ID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const user = await this.userService.updateUser(id, updateUserDto);
        return {
          statusCode: 200,
          message: 'User updated successfully',
          data: user,
        };
      },
      this.logger,
    );
  }

  @Delete('/:id')
  @ApiOperation({ summary: 'Delete user by ID' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteUser(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        await this.userService.deleteUser(id);
        return {
          statusCode: 200,
          message: 'User deleted successfully',
          data: true,
        };
      },
      this.logger,
    );
  }
}
