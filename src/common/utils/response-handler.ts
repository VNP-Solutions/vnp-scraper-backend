import { HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';

type ResponsePayload = {
  statusCode: number;
  message: string;
  data: any;
};

export class ResponseHandler {
  static async handler(
    res: Response,
    callback: () => Promise<ResponsePayload>,
    logger: Logger,
  ) {
    try {
      const response = await callback();
      return res.status(response.statusCode).json(response);
    } catch (error) {
      logger.error(error);
      // Handle NestJS HttpException properly
      if (error instanceof HttpException) {
        const status = error.getStatus();
        const response = error.getResponse();
        return res.status(status).json({
          statusCode: status,
          message:
            typeof response === 'string'
              ? response
              : (response as any).message || error.message,
          data: null,
        });
      }
      return res.status(500).json({
        statusCode: 500,
        message: error.message,
        data: null,
      });
    }
  }
}
