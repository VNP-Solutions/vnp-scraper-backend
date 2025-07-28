import { 
  IPlatformRunJobRequest, 
  IPlatformRunJobResponse, 
  IPlatformStopJobRequest, 
  IPlatformStopJobResponse,
  IPlatformRerunFailedJobRequest,
  IPlatformRerunFailedJobResponse 
} from './platform.dto';

export interface IPlatformScraperController {
  runJob(body: IPlatformRunJobRequest): Promise<IPlatformRunJobResponse>;
  stopJob(body: IPlatformStopJobRequest): Promise<IPlatformStopJobResponse>;
  rerunFailedJob(body: IPlatformRerunFailedJobRequest): Promise<IPlatformRerunFailedJobResponse>;
}