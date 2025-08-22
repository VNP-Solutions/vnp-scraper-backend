import { 
  IPlatformRunJobRequest, 
  IPlatformRunJobResponse, 
  IPlatformStopJobRequest, 
  IPlatformStopJobResponse,
  IPlatformRerunFailedJobRequest,
  IPlatformRerunFailedJobResponse 
} from './platform.dto';
import { Request, Response } from 'express';

export interface IPlatformScraperController {
  runJob(body: IPlatformRunJobRequest): Promise<IPlatformRunJobResponse>;
  stopJob(body: IPlatformStopJobRequest): Promise<IPlatformStopJobResponse>;
  rerunFailedJob(body: IPlatformRerunFailedJobRequest): Promise<IPlatformRerunFailedJobResponse>;
  health(req: Request, res: Response): Promise<any>;
}