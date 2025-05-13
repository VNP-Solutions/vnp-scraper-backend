import { Logger } from '@nestjs/common';
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
      return res.status(500).json({
        status: 'error',
        message: error.message,
        data: null,
      });
    }
  }
}
