// Generic interfaces for all scraper platforms
export interface IPlatformRunJobRequest {
  jobId: string;
  startDate?: string;
  endDate?: string;
}

export interface IPlatformRunJobResponse {
  status: number;
  message: string;
  jobId: string;
}

export interface IPlatformStopJobRequest {
  jobId: string;
}

export interface IPlatformStopJobResponse {
  status: number;
  message: string;
  jobId: string;
  finalStatus: string;
}

export interface IPlatformRerunFailedJobRequest {
  jobId: string;
  startDate?: string;
  endDate?: string;
}

export interface IPlatformRerunFailedJobResponse {
  status: number;
  message: string;
  jobId: string;
  originalStatus: string;
  finalStatus: string;
  retryAttempt?: number;
  progress?: any;
}

// Generic controller interface
export interface IPlatformScraperController {
  runJob(body: IPlatformRunJobRequest): Promise<IPlatformRunJobResponse>;
  stopJob(body: IPlatformStopJobRequest): Promise<IPlatformStopJobResponse>;
  rerunFailedJob(body: IPlatformRerunFailedJobRequest): Promise<IPlatformRerunFailedJobResponse>;
}