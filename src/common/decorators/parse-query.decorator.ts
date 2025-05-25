import { applyDecorators, UsePipes } from '@nestjs/common';
import { QueryParserPipe } from '../pipes/query-parser.pipe';

export function ParseQuery() {
  return applyDecorators(UsePipes(new QueryParserPipe()));
}