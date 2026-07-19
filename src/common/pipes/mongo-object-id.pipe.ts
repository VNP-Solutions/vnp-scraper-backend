import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

@Injectable()
export class MongoObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!OBJECT_ID_PATTERN.test(value)) {
      throw new BadRequestException(
        'Invalid ID format. Must be a 24-character hex string.',
      );
    }

    return value;
  }
}
