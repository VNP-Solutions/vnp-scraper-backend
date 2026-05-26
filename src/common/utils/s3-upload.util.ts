import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { PassThrough, Readable } from 'stream';

@Injectable()
export class S3UploadService {
  private readonly logger = new Logger(S3UploadService.name);
  private s3Client: S3Client;
  private bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get<string>('S3_REGION'),
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY'),
        secretAccessKey: this.configService.get<string>('S3_SECRET_KEY'),
      },
    });
    this.bucket = this.configService.get<string>('S3_BUCKET_NAME');
  }

  async uploadFile(file: Express.Multer.File): Promise<string> {
    try {
      const key = `uploads/${Date.now()}-${file.originalname}`;

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await this.s3Client.send(command);

      // Return the permanent URL without signature
      return `${this.configService.get<string>('S3_BUCKET_URL')}/${key}`;
    } catch (error) {
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  async uploadFileFromPath(
    filePath: string,
    key: string,
    contentType: string = 'application/json',
  ): Promise<string> {
    try {
      const fileBuffer = readFileSync(filePath);

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
      });

      await this.s3Client.send(command);

      // Return the permanent URL without signature
      return `${this.configService.get<string>('S3_BUCKET_URL')}/${key}`;
    } catch (error) {
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  /**
   * Upload an in-memory buffer (e.g. an XLSX or ZIP built by the export
   * pipeline) to the given S3 key, then return a short-lived presigned
   * GET URL so the caller can email it to the user.
   *
   * The bucket itself stays private — only the holder of the presigned
   * URL can read the object, and only until `expiresInSeconds` elapses
   * (default 7 days, the maximum allowed for SigV4 presigned URLs).
   */
  async uploadBufferAndPresign(
    key: string,
    buffer: Buffer,
    contentType: string,
    expiresInSeconds: number = 7 * 24 * 60 * 60,
  ): Promise<{ key: string; url: string; expiresAt: Date }> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );

      // SigV4 caps presigned URL expiry at 7 days (604800 s) — clamp the
      // caller's request to that ceiling.
      const MAX_EXPIRY_SECONDS = 7 * 24 * 60 * 60;
      const clampedExpiry = Math.min(
        Math.max(expiresInSeconds, 60),
        MAX_EXPIRY_SECONDS,
      );

      const url = await getSignedUrl(
        this.s3Client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
        { expiresIn: clampedExpiry },
      );

      const expiresAt = new Date(Date.now() + clampedExpiry * 1000);
      return { key, url, expiresAt };
    } catch (error) {
      throw new Error(
        `Failed to upload+presign S3 object (${key}): ${error.message}`,
      );
    }
  }

  /**
   * Stream an arbitrarily large payload to S3 and return a presigned GET
   * URL, with constant memory usage on the producer side. Uses S3
   * **multipart upload** via `@aws-sdk/lib-storage`'s `Upload`, which
   * handles part splitting, retries, and parallel uploads automatically.
   *
   * Designed for the async reports export pipeline: the caller hands us
   * a `producer` function that writes the file bytes to the
   * `PassThrough` we pass it (e.g. an exceljs `WorkbookWriter` piped
   * into the stream, or an `archiver` ZIP stream). We tee the
   * PassThrough into S3 Upload, run both sides concurrently, and
   * resolve once the upload completes and the URL is signed.
   *
   * Why this signature (producer callback) instead of just accepting a
   * stream parameter:
   *   - Keeps backpressure correct: the producer writes only as fast as
   *     S3 consumes, so memory stays bounded.
   *   - The producer can decide WHEN to start writing (e.g. after some
   *     async work). We just need to give it the writable end.
   *   - Makes the upload teardown atomic — if the producer throws, we
   *     destroy the stream and S3 aborts the multipart upload.
   */
  async uploadStreamAndPresign(
    key: string,
    contentType: string,
    producer: (writable: PassThrough) => Promise<void>,
    opts: { expiresInSeconds?: number; partSizeBytes?: number } = {},
  ): Promise<{ key: string; url: string; expiresAt: Date }> {
    const passThrough = new PassThrough();
    const uploadStartedAt = Date.now();
    this.logger.log(
      `[S3 Upload] Starting multipart upload → s3://${this.bucket}/${key} (contentType=${contentType})`,
    );

    // Start the multipart upload up-front so it begins consuming bytes
    // the instant the producer writes them. `Upload.done()` resolves
    // when all parts have been uploaded successfully.
    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: passThrough as unknown as Readable,
        ContentType: contentType,
      },
      // 5 MB minimum per part (S3 enforces this for all but the last
      // part). Larger parts → fewer round-trips but more memory pressure
      // inside the SDK. 8 MB is a sensible default.
      partSize: opts.partSizeBytes ?? 8 * 1024 * 1024,
      // Parts are uploaded in parallel — 4 keeps a single export from
      // saturating the egress link while still hiding network latency.
      queueSize: 4,
      leavePartsOnError: false,
    });

    // Progress visibility: lib-storage fires `httpUploadProgress` for
    // every part as it's flushed. Logging on every event gives the
    // operator real-time confirmation that bytes are moving (otherwise
    // a long export looks suspiciously silent for minutes). One log
    // per part is fine — typical exports finish in 1–20 parts.
    let lastLoggedPart = -1;
    upload.on('httpUploadProgress', (p) => {
      const part = p.part ?? -1;
      if (part > lastLoggedPart) {
        lastLoggedPart = part;
        const mb = ((p.loaded ?? 0) / 1024 / 1024).toFixed(2);
        this.logger.log(
          `[S3 Upload] Part ${part} uploaded — ${mb} MB total so far (key=${key})`,
        );
      }
    });

    const uploadPromise = upload.done();

    try {
      await producer(passThrough);
      // Producer may forget to close. End is idempotent — safe to call
      // even if the producer already closed the stream.
      if (!passThrough.writableEnded) passThrough.end();
    } catch (err) {
      // Tear the stream down so S3's multipart upload knows to abort
      // (rather than waiting indefinitely for more data).
      //
      // IMPORTANT: do NOT call `upload.abort()` here. It internally
      // calls `AbortController.abort()`, which dispatches the abort
      // event to lib-storage's own AbortSignal listener — and that
      // listener throws `new Error("Upload aborted.")` synchronously.
      // Node 18+ does NOT propagate listener throws back to the caller
      // of `dispatchEvent`; instead it surfaces them as
      // `uncaughtException`, which kills the whole Node process
      // (causing PM2 restart loops). A try/catch around
      // `await upload.abort()` cannot catch it. See:
      //   https://github.com/aws/aws-sdk-js-v3/issues/...
      //
      // Destroying the body PassThrough is sufficient: lib-storage's
      // internal pumping loop detects the source-stream error and
      // aborts the multipart upload itself; `uploadPromise` (i.e.
      // `upload.done()`) then rejects, which we await + swallow so
      // the original `err` is the one we rethrow.
      passThrough.destroy(err as Error);
      try {
        await uploadPromise;
      } catch {
        // expected — lib-storage rejects because we destroyed its body
      }
      throw err;
    }

    await uploadPromise;
    this.logger.log(
      `[S3 Upload] Upload complete in ${Date.now() - uploadStartedAt}ms (key=${key})`,
    );

    const MAX_EXPIRY_SECONDS = 7 * 24 * 60 * 60;
    const requested = opts.expiresInSeconds ?? MAX_EXPIRY_SECONDS;
    const clampedExpiry = Math.min(Math.max(requested, 60), MAX_EXPIRY_SECONDS);
    const url = await getSignedUrl(
      this.s3Client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: clampedExpiry },
    );
    const expiresAt = new Date(Date.now() + clampedExpiry * 1000);
    this.logger.log(
      `[S3 Upload] Presigned URL ready (expires ${expiresAt.toISOString()}, key=${key})`,
    );
    return { key, url, expiresAt };
  }

  async deleteFile(url: string): Promise<void> {
    try {
      // Extract the key from the URL
      const key = url.replace(
        `${this.configService.get<string>('S3_BUCKET_URL')}/`,
        '',
      );

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
    } catch (error) {
      throw new Error(`Failed to delete file from S3: ${error.message}`);
    }
  }
}
