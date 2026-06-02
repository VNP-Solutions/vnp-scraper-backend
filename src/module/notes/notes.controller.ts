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
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ParseQuery } from 'src/common/decorators/parse-query.decorator';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateNoteDto, UpdateNoteDto } from './notes.dto';
import { INotesService } from './notes.interface';
import { createNoteSchema, updateNoteSchema } from './notes.validation';

@ApiTags('Notes')
@Controller('/notes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class NotesController {
  constructor(
    @Inject('INotesService')
    private readonly notesService: INotesService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a note', description: 'Create a new note linked to an onboarding record and a user.' })
  @ApiBody({ type: CreateNoteDto })
  @ApiResponse({ status: 201, description: 'Note created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ValidateBody(createNoteSchema)
  async create(@Req() request: any, @Body() body: CreateNoteDto, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const data = await this.notesService.create({
          ...body,
          user_id: request.user?.userId,
        });
        return { statusCode: 201, message: 'Note created successfully', data };
      },
      this.logger,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List notes',
    description: 'Paginated list of notes. Filter by onboarding_id or user_id.',
  })
  @ApiQuery({ name: 'onboarding_id', required: false, description: 'Filter by onboarding ID' })
  @ApiQuery({ name: 'user_id', required: false, description: 'Filter by user ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Page size (default 10)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field (e.g. createdAt)' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], description: 'Sort direction' })
  @ApiResponse({ status: 200, description: 'Notes retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@ParseQuery() query: Record<string, any>, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.notesService.findAll(query);
        return {
          statusCode: 200,
          message: 'Notes retrieved successfully',
          data: result.data,
          metadata: result.metadata,
        };
      },
      this.logger,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a note by ID' })
  @ApiParam({ name: 'id', description: 'Note ObjectId' })
  @ApiResponse({ status: 200, description: 'Note retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Note not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findOne(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const data = await this.notesService.findById(id);
        return { statusCode: 200, message: 'Note retrieved successfully', data };
      },
      this.logger,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a note', description: 'Update the comment of an existing note.' })
  @ApiParam({ name: 'id', description: 'Note ObjectId' })
  @ApiBody({ type: UpdateNoteDto })
  @ApiResponse({ status: 200, description: 'Note updated successfully' })
  @ApiResponse({ status: 404, description: 'Note not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ValidateBody(updateNoteSchema)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateNoteDto,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const data = await this.notesService.update(id, body);
        return { statusCode: 200, message: 'Note updated successfully', data };
      },
      this.logger,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a note' })
  @ApiParam({ name: 'id', description: 'Note ObjectId' })
  @ApiResponse({ status: 200, description: 'Note deleted successfully' })
  @ApiResponse({ status: 404, description: 'Note not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async remove(@Param('id') id: string, @Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const data = await this.notesService.delete(id);
        return { statusCode: 200, message: 'Note deleted successfully', data };
      },
      this.logger,
    );
  }
}
