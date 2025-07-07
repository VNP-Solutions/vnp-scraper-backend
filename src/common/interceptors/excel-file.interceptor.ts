import { BadRequestException, Injectable } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

/**
 * Excel File Interceptor Configuration
 * Handles Excel and CSV file uploads with validation and size limits
 */
@Injectable()
export class ExcelFileInterceptorOptions {
  static create(
    fieldName: string = 'file',
    options?: Partial<MulterOptions>,
  ): any {
    const defaultOptions: MulterOptions = {
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'application/vnd.ms-excel', // .xls
          'text/csv', // .csv
          'application/csv', // alternative CSV mime type
        ];

        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Invalid file type. Only Excel files (.xlsx, .xls) and CSV files are allowed.',
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 1, // Only allow single file upload
      },
      ...options, // Allow override of default options
    };

    return FileInterceptor(fieldName, defaultOptions);
  }
}

/**
 * Predefined Excel File Interceptor for common use cases
 */
export const ExcelFileInterceptor = ExcelFileInterceptorOptions.create('file');

/**
 * Large Excel File Interceptor (50MB limit) for bulk imports
 */
export const LargeExcelFileInterceptor = ExcelFileInterceptorOptions.create(
  'file',
  {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit
      files: 1,
    },
  },
);

/**
 * Strict Excel File Interceptor (only .xlsx and .xls, no CSV)
 */
export const StrictExcelFileInterceptor = ExcelFileInterceptorOptions.create(
  'file',
  {
    fileFilter: (req, file, cb) => {
      const allowedMimes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
      ];

      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new BadRequestException(
            'Invalid file type. Only Excel files (.xlsx, .xls) are allowed.',
          ),
          false,
        );
      }
    },
  },
);
