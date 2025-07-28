import { HttpService } from '@nestjs/axios';
import { HttpStatus, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { IScraperJobItemService } from './scraper-job-item.interface';
import { 
  IPlatformRunJobRequest, 
  IPlatformRunJobResponse, 
  IPlatformStopJobRequest, 
  IPlatformStopJobResponse,
  IPlatformRerunFailedJobRequest,
  IPlatformRerunFailedJobResponse,
  IPlatformScraperController 
} from './platform.dto';

export abstract class BaseScraperController implements IPlatformScraperController {
  protected readonly scraperBaseUrl: string;

  constructor(
    protected readonly httpService: HttpService,
    protected readonly configService: ConfigService,
    @Inject('IScraperJobItemService')
    protected readonly jobItemService: IScraperJobItemService,
  ) {
    const baseUrl = this.configService.get<string>('SCRAPER_BASE_URL');
    this.scraperBaseUrl =
      baseUrl.startsWith('http://') || baseUrl.startsWith('https://')
        ? baseUrl
        : `http://${baseUrl}`;
  }

  protected async forwardRequest(
    endpoint: string,
    body?: any,
    timeout: number = 300000,
  ): Promise<any> {
    const response = await firstValueFrom(
      this.httpService.post(`${this.scraperBaseUrl}${endpoint}`, body, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout,
      }),
    );
    return response;
  }

  protected async forwardGetRequest(
    endpoint: string,
    headers?: any,
    params?: any,
  ): Promise<any> {
    const response = await firstValueFrom(
      this.httpService.get(`${this.scraperBaseUrl}${endpoint}`, {
        headers,
        params,
      }),
    );
    return response;
  }

  protected handleError(error: any, defaultMessage: string) {
    const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
    const data = error.response?.data || { message: defaultMessage };
    return { status, data };
  }

  protected sendResponse(res: Response, response: any) {
    return res.status(response.status).json(response.data);
  }

  protected sendErrorResponse(res: Response, error: any, defaultMessage: string) {
    const { status, data } = this.handleError(error, defaultMessage);
    return res.status(status).json(data);
  }

  // Abstract methods to be implemented by platform-specific controllers
  abstract runJob(body: IPlatformRunJobRequest): Promise<IPlatformRunJobResponse>;
  abstract stopJob(body: IPlatformStopJobRequest): Promise<IPlatformStopJobResponse>;
  abstract rerunFailedJob(body: IPlatformRerunFailedJobRequest): Promise<IPlatformRerunFailedJobResponse>;

  // Platform-specific endpoint paths - to be overridden
  protected abstract getRunJobEndpoint(): string;
  protected abstract getStopJobEndpoint(): string;
  protected abstract getRerunFailedJobEndpoint(): string;
  protected abstract getPlatformDownMessage(): string;
}