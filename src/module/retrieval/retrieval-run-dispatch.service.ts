import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

const AGODA_BULK_RUN_PATH = '/api/agoda/bulk-retrieval-run-job';
const RUN_TIMEOUT_MS = 300000;

/**
 * Starts the Agoda retrieval run for retrievals this backend has just written,
 * so the send-to-retrieval flows no longer need a manual follow-up call to
 * `POST /scraper/api/batch-retrieval-run-job`.
 *
 * The run itself takes minutes on the Agoda server, so the dispatch is
 * fire-and-forget: the retrievals are already committed by the time we get
 * here, and a scraper that is down must not turn a successful write into a
 * failed response. Outcomes are logged instead.
 */
@Injectable()
export class RetrievalRunDispatchService {
  private readonly logger = new Logger(RetrievalRunDispatchService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private getAgodaRetrievalUrl(): string | null {
    const url = this.configService.get<string>('AGODA_RETRIVAL_SERVER_URL');
    if (!url) return null;

    if (url.startsWith('http://') || url.startsWith('https://')) return url;

    const protocol =
      this.configService.get('NODE_ENV') === 'production' ? 'https' : 'http';
    return `${protocol}://${url}`;
  }

  /**
   * Queues one bulk run covering every retrieval created by a single
   * send-to-retrieval call. `context` is only used to make the logs traceable
   * back to the caller.
   */
  dispatchAgodaBulkRun(retrievalIds: string[], context: string): void {
    const ids = Array.from(new Set(retrievalIds ?? [])).filter(Boolean);
    if (ids.length === 0) return;

    const agodaUrl = this.getAgodaRetrievalUrl();
    if (!agodaUrl) {
      this.logger.error(
        `${context}: cannot auto-start ${ids.length} retrieval(s) — no AGODA_RETRIVAL_SERVER_URL configured. ` +
          `Run them manually with POST /scraper/api/batch-retrieval-run-job.`,
      );
      return;
    }

    this.logger.log(
      `🚀 ${context}: auto-starting ${ids.length} retrieval(s) via ${agodaUrl}${AGODA_BULK_RUN_PATH}`,
    );

    void firstValueFrom(
      this.httpService.post(
        `${agodaUrl}${AGODA_BULK_RUN_PATH}`,
        { retrieval_ids: ids },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: RUN_TIMEOUT_MS,
        },
      ),
    )
      .then((response) => {
        this.logger.log(
          `${context}: Agoda retrieval server accepted ${ids.length} retrieval(s) ` +
            `(status=${response.status}): ${response.data?.message ?? 'no message returned'}`,
        );
      })
      .catch((error: any) => {
        this.logger.error(
          `${context}: Agoda retrieval server did not start ${ids.join(', ')}: ` +
            `${error?.response?.data?.message || error?.message || String(error)}`,
        );
      });
  }
}
