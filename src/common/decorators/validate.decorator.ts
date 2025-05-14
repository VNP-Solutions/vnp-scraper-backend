import { applyDecorators, UsePipes } from '@nestjs/common';
import { ZodSchema } from 'zod';

import { ZodValidationPipe } from '../pipes/validation.pipe';

export function ValidateBody(schema: ZodSchema) {
  return applyDecorators(UsePipes(new ZodValidationPipe(schema)));
}
