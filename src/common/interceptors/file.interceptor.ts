import { BadRequestException, Injectable } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

/**
 * File type configurations for different use cases
 */
export const FileTypeConfigs = {
  // Image files
  IMAGES: {
    mimeTypes: [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ],
    maxSize: 5 * 1024 * 1024, // 5MB
    errorMessage:
      'Invalid file type. Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed.',
  },

  // Document files
  DOCUMENTS: {
    mimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ],
    maxSize: 25 * 1024 * 1024, // 25MB
    errorMessage:
      'Invalid file type. Only document files (PDF, DOC, DOCX, TXT) are allowed.',
  },

  // Excel and CSV files
  EXCEL: {
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
    ],
    maxSize: 10 * 1024 * 1024, // 10MB
    errorMessage:
      'Invalid file type. Only Excel files (.xlsx, .xls) and CSV files are allowed.',
  },

  // General files (more permissive)
  GENERAL: {
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'text/plain',
    ],
    maxSize: 50 * 1024 * 1024, // 50MB
    errorMessage: 'Invalid file type. Please upload a valid file.',
  },
};

/**
 * Flexible File Interceptor Factory
 */
@Injectable()
export class FileInterceptorFactory {
  /**
   * Create a file interceptor with custom configuration
   */
  static create(
    fieldName: string = 'file',
    config: {
      mimeTypes?: string[];
      maxSize?: number;
      errorMessage?: string;
      maxFiles?: number;
    } = {},
    additionalOptions?: Partial<MulterOptions>,
  ): any {
    const {
      mimeTypes = FileTypeConfigs.GENERAL.mimeTypes,
      maxSize = FileTypeConfigs.GENERAL.maxSize,
      errorMessage = FileTypeConfigs.GENERAL.errorMessage,
      maxFiles = 1,
    } = config;

    const multerOptions: MulterOptions = {
      fileFilter: (req, file, cb) => {
        if (mimeTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(errorMessage), false);
        }
      },
      limits: {
        fileSize: maxSize,
        files: maxFiles,
      },
      ...additionalOptions,
    };

    return FileInterceptor(fieldName, multerOptions);
  }

  /**
   * Create an interceptor for specific file type
   */
  static forType(
    type: keyof typeof FileTypeConfigs,
    fieldName: string = 'file',
    additionalOptions?: Partial<MulterOptions>,
  ): any {
    const config = FileTypeConfigs[type];
    return this.create(
      fieldName,
      {
        mimeTypes: config.mimeTypes,
        maxSize: config.maxSize,
        errorMessage: config.errorMessage,
      },
      additionalOptions,
    );
  }
}

/**
 * Predefined interceptors for common use cases
 */
export const ImageFileInterceptor = FileInterceptorFactory.forType('IMAGES');
export const DocumentFileInterceptor =
  FileInterceptorFactory.forType('DOCUMENTS');
export const GeneralFileInterceptor = FileInterceptorFactory.forType('GENERAL');

/**
 * Multiple files interceptor factory
 */
export class MultipleFileInterceptorFactory {
  static create(
    fieldName: string = 'files',
    maxCount: number = 10,
    config: {
      mimeTypes?: string[];
      maxSize?: number;
      errorMessage?: string;
    } = {},
  ): any {
    const {
      mimeTypes = FileTypeConfigs.GENERAL.mimeTypes,
      maxSize = FileTypeConfigs.GENERAL.maxSize,
      errorMessage = FileTypeConfigs.GENERAL.errorMessage,
    } = config;

    // Note: For multiple files, you'd use FilesInterceptor from @nestjs/platform-express
    // This is a placeholder for the pattern - actual implementation would need FilesInterceptor
    return FileInterceptorFactory.create(fieldName, {
      mimeTypes,
      maxSize,
      errorMessage,
      maxFiles: maxCount,
    });
  }
}
