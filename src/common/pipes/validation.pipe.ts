import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { Schema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: Schema) {}

  transform(value: any, metadata: any) {
    if (metadata.type === 'body') {
      try {
        const parsedValue = this.schema.parse(value);
        return parsedValue;
      } catch (error) {
        const formattedErrors = error.errors.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        throw new BadRequestException({
          statusCode: 400,
          message: 'Validation failed',
          errors: formattedErrors,
        });
      }
    }
    return value;
  }
}
