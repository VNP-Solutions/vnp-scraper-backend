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
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ValidateBody } from 'src/common/decorators/validate.decorator';
import { ResponseHandler } from 'src/common/utils/response-handler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AgodaCaseItemNoteResponseDto,
  CreateAgodaCaseItemNoteDto,
  UpdateAgodaCaseItemNoteDto,
} from './agoda-case-item-note.dto';
import { IAgodaCaseItemNoteService } from './agoda-case-item-note.interface';
import {
  createAgodaCaseItemNoteSchema,
  updateAgodaCaseItemNoteSchema,
} from './agoda-case-item-note.validation';

@ApiTags('Agoda Case Item Notes')
@ApiBearerAuth('JWT-auth')
@Controller('agoda-case-items/:agodaCaseItemId/notes')
@UseGuards(JwtAuthGuard)
export class AgodaCaseItemNoteController {
  private readonly logger = new Logger(AgodaCaseItemNoteController.name);

  constructor(
    @Inject('IAgodaCaseItemNoteService')
    private readonly noteService: IAgodaCaseItemNoteService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Add a note to an agoda case item',
    description:
      'The note author is taken from the JWT token — not passed in the body. note_time is set to the ' +
      'creation instant and never changes afterward, even if the note text is later edited.',
  })
  @ApiParam({ name: 'agodaCaseItemId', description: 'Agoda case item ID' })
  @ApiResponse({
    status: 201,
    description: 'Note added successfully',
    type: AgodaCaseItemNoteResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Agoda case item not found' })
  @ValidateBody(createAgodaCaseItemNoteSchema)
  async create(
    @Param('agodaCaseItemId') agodaCaseItemId: string,
    @Body() body: CreateAgodaCaseItemNoteDto,
    @Request() req: any,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const userId = req.user?.userId;
        const note = await this.noteService.create(
          agodaCaseItemId,
          userId,
          body.note,
        );
        return {
          statusCode: 201,
          message: 'Note added successfully',
          data: note,
        };
      },
      this.logger,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List every note on an agoda case item, newest first' })
  @ApiParam({ name: 'agodaCaseItemId', description: 'Agoda case item ID' })
  @ApiResponse({
    status: 200,
    description: 'Notes retrieved successfully',
    type: [AgodaCaseItemNoteResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Agoda case item not found' })
  async findAll(
    @Param('agodaCaseItemId') agodaCaseItemId: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const notes = await this.noteService.findAllByCaseItem(agodaCaseItemId);
        return {
          statusCode: 200,
          message: 'Notes retrieved successfully',
          data: notes,
        };
      },
      this.logger,
    );
  }

  @Get(':noteId')
  @ApiOperation({ summary: 'Get a single note by ID' })
  @ApiParam({ name: 'agodaCaseItemId', description: 'Agoda case item ID' })
  @ApiParam({ name: 'noteId', description: 'Note ID' })
  @ApiResponse({
    status: 200,
    description: 'Note retrieved successfully',
    type: AgodaCaseItemNoteResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Agoda case item or note not found' })
  async findOne(
    @Param('agodaCaseItemId') agodaCaseItemId: string,
    @Param('noteId') noteId: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const note = await this.noteService.findOne(agodaCaseItemId, noteId);
        return {
          statusCode: 200,
          message: 'Note retrieved successfully',
          data: note,
        };
      },
      this.logger,
    );
  }

  @Put(':noteId')
  @ApiOperation({
    summary: 'Update a note',
    description: 'Only the user who originally wrote the note may edit it. note_time is left untouched — only note and updatedAt change.',
  })
  @ApiParam({ name: 'agodaCaseItemId', description: 'Agoda case item ID' })
  @ApiParam({ name: 'noteId', description: 'Note ID' })
  @ApiResponse({
    status: 200,
    description: 'Note updated successfully',
    type: AgodaCaseItemNoteResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Only the note author can update it' })
  @ApiResponse({ status: 404, description: 'Agoda case item or note not found' })
  @ValidateBody(updateAgodaCaseItemNoteSchema)
  async update(
    @Param('agodaCaseItemId') agodaCaseItemId: string,
    @Param('noteId') noteId: string,
    @Body() body: UpdateAgodaCaseItemNoteDto,
    @Request() req: any,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const userId = req.user?.userId;
        const note = await this.noteService.update(
          agodaCaseItemId,
          noteId,
          userId,
          body.note,
        );
        return {
          statusCode: 200,
          message: 'Note updated successfully',
          data: note,
        };
      },
      this.logger,
    );
  }

  @Delete(':noteId')
  @ApiOperation({
    summary: 'Delete a note',
    description: 'Only the user who originally wrote the note may delete it.',
  })
  @ApiParam({ name: 'agodaCaseItemId', description: 'Agoda case item ID' })
  @ApiParam({ name: 'noteId', description: 'Note ID' })
  @ApiResponse({ status: 200, description: 'Note deleted successfully' })
  @ApiResponse({ status: 403, description: 'Only the note author can delete it' })
  @ApiResponse({ status: 404, description: 'Agoda case item or note not found' })
  async delete(
    @Param('agodaCaseItemId') agodaCaseItemId: string,
    @Param('noteId') noteId: string,
    @Request() req: any,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const userId = req.user?.userId;
        const result = await this.noteService.delete(
          agodaCaseItemId,
          noteId,
          userId,
        );
        return {
          statusCode: 200,
          message: 'Note deleted successfully',
          data: result,
        };
      },
      this.logger,
    );
  }
}
