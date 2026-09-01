/**
 * Downloads and parses the CSV / XLSX files Agoda Partner Support attaches to
 * its replies (for example `69836fdc661b7989c3cec535.csv`), archives the
 * original to S3, and runs the reopen rules over the parsed rows.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { gmail_v1 } from 'googleapis';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { S3UploadService } from '../../common/utils/s3-upload.util';
import { evaluateReopenDecision } from './reopen-rules';
import type {
  AttachmentFormat,
  ParsedAttachment,
  ReopenRuleOptions,
} from './support-email.types';

export interface AttachmentContext {
  /** Agoda property ID, used to reject rows belonging to another hotel. */
  agodaId?: string | null;
  reopenRules?: ReopenRuleOptions;
  /** Archive the original file to S3. Defaults to true. */
  uploadToS3?: boolean;
}

interface AttachmentRef {
  filename: string;
  mimeType: string;
  attachmentId: string;
  sizeBytes: number;
}

function detectFormat(filename: string, mimeType: string): AttachmentFormat {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'csv') return 'csv';
  if (extension === 'xlsx' || extension === 'xls') return 'xlsx';

  const type = mimeType.toLowerCase();
  if (type.includes('csv')) return 'csv';
  if (type.includes('spreadsheet') || type.includes('excel')) return 'xlsx';
  return 'unknown';
}

/**
 * Walks the MIME tree collecting every downloadable attachment reference.
 */
export function collectAttachmentRefs(
  payload: gmail_v1.Schema$MessagePart | undefined,
  refs: AttachmentRef[] = [],
): AttachmentRef[] {
  if (!payload) return refs;

  const filename = payload.filename ?? '';
  const attachmentId = payload.body?.attachmentId;

  if (filename && attachmentId) {
    refs.push({
      filename,
      mimeType: payload.mimeType ?? 'application/octet-stream',
      attachmentId,
      sizeBytes: payload.body?.size ?? 0,
    });
  }

  for (const part of payload.parts ?? []) {
    collectAttachmentRefs(part, refs);
  }

  return refs;
}

function toStringRecord(row: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key.trim()] = value == null ? '' : String(value).trim();
  }
  return normalized;
}

function parseCsv(buffer: Buffer): {
  columns: string[];
  rows: Record<string, string>[];
} {
  // Strip a UTF-8 BOM so the first column name does not gain a stray prefix.
  const content = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const result = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  return {
    columns: (result.meta.fields ?? []).map((field) => field.trim()),
    rows: result.data.map(toStringRecord),
  };
}

function parseXlsx(buffer: Buffer): {
  columns: string[];
  rows: Record<string, string>[];
} {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { columns: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
    .map(toStringRecord);

  const columns = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    range: 0,
  })[0];

  return {
    columns: (columns ?? []).map((column) => String(column).trim()),
    rows,
  };
}

export function parseAttachmentBuffer(
  filename: string,
  mimeType: string,
  buffer: Buffer,
): ParsedAttachment {
  const format = detectFormat(filename, mimeType);
  const base = {
    filename,
    mimeType,
    sizeBytes: buffer.length,
    format,
  };

  if (format === 'unknown') {
    return {
      ...base,
      columns: [],
      rows: [],
      rowCount: 0,
      parseError: `Unsupported attachment type: ${filename}`,
    };
  }

  try {
    const { columns, rows } =
      format === 'csv' ? parseCsv(buffer) : parseXlsx(buffer);
    return { ...base, columns, rows, rowCount: rows.length };
  } catch (error: any) {
    return {
      ...base,
      columns: [],
      rows: [],
      rowCount: 0,
      parseError: error?.message || String(error),
    };
  }
}

/** Keeps the key readable while staying inside S3's safe character set. */
function sanitizeFilename(filename: string): string {
  const cleaned = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return cleaned || 'attachment';
}

function contentTypeFor(mimeType: string, format: AttachmentFormat): string {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  if (format === 'csv') return 'text/csv';
  if (format === 'xlsx') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  return 'application/octet-stream';
}

/**
 * The key is derived only from the Gmail message and the filename, so a
 * message seen again in a later run overwrites its own object instead of
 * piling up copies, and the URL already on record stays valid.
 */
export function buildAttachmentS3Key(
  agodaId: string | null | undefined,
  messageId: string,
  filename: string,
): string {
  return `support-email-attachments/${agodaId || 'unknown'}/${messageId}/${sanitizeFilename(filename)}`;
}

@Injectable()
export class AttachmentParserService {
  private readonly logger = new Logger(AttachmentParserService.name);

  constructor(private readonly s3UploadService: S3UploadService) {}

  /**
   * Uploads one attachment. Never throws: losing the archive copy must not
   * fail the scrape, so the reason is recorded on the attachment instead.
   */
  private async uploadAttachmentToS3(input: {
    agodaId: string | null | undefined;
    messageId: string;
    filename: string;
    mimeType: string;
    format: AttachmentFormat;
    buffer: Buffer;
  }): Promise<{ s3Url: string | null; s3Key: string | null; uploadError?: string }> {
    const s3Key = buildAttachmentS3Key(
      input.agodaId,
      input.messageId,
      input.filename,
    );

    try {
      const s3Url = await this.s3UploadService.uploadBuffer(
        s3Key,
        input.buffer,
        contentTypeFor(input.mimeType, input.format),
      );

      this.logger.log(
        `☁️ Uploaded attachment ${input.filename} to S3 (messageId=${input.messageId}, agodaId=${input.agodaId ?? 'unknown'}, key=${s3Key})`,
      );

      return { s3Url, s3Key };
    } catch (error: any) {
      const uploadError = error?.message || String(error);
      this.logger.warn(
        `⚠️ Failed to upload attachment ${input.filename} to S3 (messageId=${input.messageId}, key=${s3Key}): ${uploadError}`,
      );
      return { s3Url: null, s3Key, uploadError };
    }
  }

  /**
   * Downloads every CSV / XLSX attachment on a message and parses it into
   * rows. Attachments of other types are reported with a `parseError`
   * rather than dropped, so the caller can still see what came through.
   */
  async downloadAndParseAttachments(
    gmail: gmail_v1.Gmail,
    messageId: string,
    payload: gmail_v1.Schema$MessagePart | undefined,
    context: AttachmentContext = {},
  ): Promise<ParsedAttachment[]> {
    const refs = collectAttachmentRefs(payload);
    if (refs.length === 0) return [];

    this.logger.log(
      `📎 Found ${refs.length} attachment(s) on message ${messageId}`,
    );

    const parsed: ParsedAttachment[] = [];

    for (const ref of refs) {
      if (detectFormat(ref.filename, ref.mimeType) === 'unknown') {
        this.logger.log(`⏭️ Skipping non-tabular attachment: ${ref.filename}`);
        parsed.push({
          filename: ref.filename,
          mimeType: ref.mimeType,
          sizeBytes: ref.sizeBytes,
          format: 'unknown',
          columns: [],
          rows: [],
          rowCount: 0,
          parseError: 'Unsupported attachment type',
        });
        continue;
      }

      try {
        const response = await gmail.users.messages.attachments.get({
          userId: 'me',
          messageId,
          id: ref.attachmentId,
        });

        const data = response.data.data;
        if (!data) {
          throw new Error('Gmail returned an empty attachment body');
        }

        const buffer = Buffer.from(data, 'base64url');
        const attachment = parseAttachmentBuffer(
          ref.filename,
          ref.mimeType,
          buffer,
        );

        if (context.uploadToS3 !== false) {
          const upload = await this.uploadAttachmentToS3({
            agodaId: context.agodaId,
            messageId,
            filename: ref.filename,
            mimeType: ref.mimeType,
            format: attachment.format,
            buffer,
          });
          attachment.s3Url = upload.s3Url;
          attachment.s3Key = upload.s3Key;
          attachment.uploadError = upload.uploadError;
        }

        const decision = evaluateReopenDecision(
          attachment,
          { agodaId: context.agodaId },
          context.reopenRules,
        );
        attachment.reopenDecision = decision;

        this.logger.log(
          `✅ Parsed attachment ${ref.filename} (${attachment.rowCount} rows) — ` +
            `sheetType=${decision.sheetType}, shouldReopen=${decision.shouldReopen}, ` +
            `collect=${decision.collect.length}, reopen=${decision.reopen.length}, ` +
            `skipped=${decision.skipped.length}, s3Url=${attachment.s3Url ?? 'n/a'}`,
        );
        parsed.push(attachment);
      } catch (error: any) {
        this.logger.warn(
          `⚠️ Failed to download attachment ${ref.filename}: ${error?.message || String(error)}`,
        );
        parsed.push({
          filename: ref.filename,
          mimeType: ref.mimeType,
          sizeBytes: ref.sizeBytes,
          format: detectFormat(ref.filename, ref.mimeType),
          columns: [],
          rows: [],
          rowCount: 0,
          parseError: error?.message || String(error),
        });
      }
    }

    return parsed;
  }
}
