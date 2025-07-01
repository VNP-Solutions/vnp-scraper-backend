import { Query } from '@nestjs/common';
import { QueryParserPipe } from '../pipes/query-parser.pipe';

export function ParseQuery() {
  return Query(new QueryParserPipe());
}
