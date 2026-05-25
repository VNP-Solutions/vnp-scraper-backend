import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';

@Injectable()
export class S3UploadService {
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
