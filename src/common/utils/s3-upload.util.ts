import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

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
      return `${ this.configService.get<string>('S3_BUCKET_URL') }/${key}`;
    } catch (error) {
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  async deleteFile(url: string): Promise<void> {
    try {
      // Extract the key from the URL
      const key = url.replace(`${this.configService.get<string>('S3_BUCKET_URL')}/`, '');
      
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