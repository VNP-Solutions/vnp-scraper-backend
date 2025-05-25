import { Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class QueryParserPipe implements PipeTransform {
  transform(value: any) {
    if (!value) return {};

    const query = value as Record<string, unknown>;
    
    Object.keys(query).forEach(item => {
      const value = query[item];
      
      if (typeof value === 'string') {
        if (value === 'true') {
          query[item] = true;
        } else if (value === 'false') {
          query[item] = false;
        } else if (value === 'undefined') {
          query[item] = undefined;
        } else if (value === 'null') {
          query[item] = null;
        }
      }

      if (item === 'search' && !query[item]) {
        delete query[item];
      }

      if (item === 'category' && query.category === 'All') {
        delete query.category;
      }

      if (!Number.isNaN(Number(query[item]))) {
        query[item] = Number(query[item]);
      }
    });

    return query;
  }
}