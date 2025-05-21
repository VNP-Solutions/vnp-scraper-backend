import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  Body,
  Patch,
  Res,
  Logger,
  Inject,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { IUploadService } from './upload.interface';
import { ResponseHandler } from '../../common/utils/response-handler';

@ApiTags('Upload')
@Controller('/upload')
export class UploadController {
  constructor(
    @Inject('IUploadService')
    private readonly uploadService: IUploadService,
    private readonly logger: Logger,
  ) {}

  @Post('/direct')
  @ApiOperation({ summary: 'Upload file directly to S3' })
  @ApiResponse({ status: 201, description: 'File uploaded to S3 successfully' })
  @ApiResponse({ status: 400, description: 'No file uploaded' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadToS3(
    @UploadedFile() file: Express.Multer.File,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.uploadService.uploadFileToS3(file);
        return {
          statusCode: 201,
          message: 'File uploaded to S3 successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Upload file to S3 and save to database' })
  @ApiResponse({ status: 201, description: 'File uploaded and saved successfully' })
  @ApiResponse({ status: 400, description: 'No file uploaded' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadToDb(
    @UploadedFile() file: Express.Multer.File,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const result = await this.uploadService.uploadFileToDb(file);
        return {
          statusCode: 201,
          message: 'File uploaded and saved successfully',
          data: result,
        };
      },
      this.logger,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all files' })
  @ApiResponse({ status: 200, description: 'Files retrieved successfully' })
  async getAllFiles(@Res() response: Response) {
    return ResponseHandler.handler(
      response,
      async () => {
        const files = await this.uploadService.getAllFiles();
        return {
          statusCode: 200,
          message: 'Files retrieved successfully',
          data: files,
        };
      },
      this.logger,
    );
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Get file by ID' })
  @ApiResponse({ status: 200, description: 'File retrieved successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async getFileById(
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const file = await this.uploadService.getFileById(id);
        return {
          statusCode: 200,
          message: 'File retrieved successfully',
          data: file,
        };
      },
      this.logger,
    );
  }

  @Put('/:id')
  @ApiOperation({ summary: 'Update file by ID' })
  @ApiResponse({ status: 200, description: 'File updated successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async updateFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        const updatedFile = await this.uploadService.updateFile(id, file);
        return {
          statusCode: 200,
          message: 'File updated successfully',
          data: updatedFile,
        };
      },
      this.logger,
    );
  }

  @Delete('/:id')
  @ApiOperation({ summary: 'Delete file from S3 and database' })
  @ApiResponse({ status: 200, description: 'File deleted successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async deleteFileFromS3AndDb(
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        await this.uploadService.deleteFileFromS3AndDb(id);
        return {
          statusCode: 200,
          message: 'File deleted successfully',
          data: null,
        };
      },
      this.logger,
    );
  }

  @Patch('/delete/direct')
  @ApiOperation({ summary: 'Delete file from S3 only' })
  @ApiResponse({ status: 200, description: 'File deleted from S3 successfully' })
  @ApiResponse({ status: 400, description: 'Invalid URL provided' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          example: 'https://bucket.s3.region.amazonaws.com/file.jpg',
          description: 'S3 URL of the file to delete',
        },
      },
    },
  })
  async deleteFileFromS3(
    @Body('url') url: string,
    @Res() response: Response,
  ) {
    return ResponseHandler.handler(
      response,
      async () => {
        await this.uploadService.deleteFileFromS3(url);
        return {
          statusCode: 200,
          message: 'File deleted from S3 successfully',
          data: null,
        };
      },
      this.logger,
    );
  }
}