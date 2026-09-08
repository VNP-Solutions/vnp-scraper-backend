/**
 * Reads the Agoda Partner Support reply an earlier
 * `POST /api/agoda/retrive-case-email` call stored, and — for every job
 * whose reply leaves nothing to reopen — hands the collectable bookings to
 * the retrieval side as a `ParentRetrieval` + `Retrieval` per property.
 *
 * Pure database endpoint: no Gmail, no S3, no worker pool.
 */

export interface SendToRetrievalSkipped {
  jobId: string;
  agodaId?: string;
  reason: string;
}

export interface SendToRetrievalInvalid {
  jobId: string;
  reason: string;
  currentStatus?: string;
}

export interface SendToRetrievalError {
  jobId: string;
  error: string;
}

export interface CreatedRetrievalEntry {
  jobId: string;
  agodaId: string;
  retrievalId: string;
  reservationCount: number;
}

export interface FailedRetrievalEntry {
  jobId: string;
  error: string;
}

export interface CollectRetrievalResult {
  parentRetrievalId: string | null;
  parentRetrievalName: string | null;
  created: CreatedRetrievalEntry[];
  failed: FailedRetrievalEntry[];
}

export interface RunSendToRetrievalResult {
  message: string;
  results: {
    skipped: SendToRetrievalSkipped[];
    invalid: SendToRetrievalInvalid[];
    errors: SendToRetrievalError[];
    retrieval: CollectRetrievalResult;
  };
}

/** Use-case layer behind POST /api/agoda/send-to-retrieval. */
export interface ISendToRetrievalService {
  runJob(jobIds: string[]): Promise<RunSendToRetrievalResult>;
}
