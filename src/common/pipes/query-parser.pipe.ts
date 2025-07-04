import { Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class QueryParserPipe implements PipeTransform {
  transform(value: any) {
    if (!value || typeof value !== 'object') return {};

    const query = value as Record<string, unknown>;

    Object.keys(query).forEach((item) => {
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
        } else if (item === 'start_date' || item === 'end_date') {
          let date: Date;
          if (!value || value === '') {
            date = new Date();
          } else {
            date = new Date(value);
          }

          if (!isNaN(date.getTime())) {
            if (item === 'start_date') {
              date.setHours(0, 0, 0, 0);
            } else {
              date.setHours(23, 59, 59, 999);
            }
            query[item] = date;
          }
        }
      }

      if (item === 'search' && !query[item]) {
        delete query[item];
      }

      if (query[item] === 'All') {
        delete query[item];
      }

      // Only convert to number if it's a valid number and not an ID-like string
      const stringValue = String(query[item]);
      const isValidNumber =
        !Number.isNaN(Number(stringValue)) && stringValue.trim() !== '';
      const isNotSpecialField = item !== 'phone_number' && item !== 'search';
      const isNotObjectId = !/^[a-f\d]{24}$/i.test(stringValue); // MongoDB ObjectId pattern
      const isNotLongId = stringValue.length < 20; // Avoid converting long ID strings

      if (isValidNumber && isNotSpecialField && isNotObjectId && isNotLongId) {
        query[item] = Number(stringValue);
      }
    });

    return query;
  }
}
