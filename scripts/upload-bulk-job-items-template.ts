#!/usr/bin/env ts-node

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Uploads the bulk job-items import template CSV to S3.
 *
 * Usage:
 *   Set the S3 env vars from your .env file, then run:
 *     npx ts-node scripts/upload-bulk-job-items-template.ts
 *
 *   On Windows PowerShell:
 *     $env:S3_REGION="us-east-1"; $env:S3_BUCKET_NAME="..."; $env:S3_BUCKET_URL="..."; $env:S3_ACCESS_KEY="..."; $env:S3_SECRET_KEY="..."; npx ts-node scripts/upload-bulk-job-items-template.ts
 */

const BUCKET_URL = (process.env.S3_BUCKET_URL || '').replace(/\/$/, '');
const BUCKET_NAME = process.env.S3_BUCKET_NAME || '';
const REGION = process.env.S3_REGION || 'us-east-1';
const ACCESS_KEY = process.env.S3_ACCESS_KEY || '';
const SECRET_KEY = process.env.S3_SECRET_KEY || '';

if (!BUCKET_NAME || !BUCKET_URL || !ACCESS_KEY || !SECRET_KEY) {
  console.error(
    'Missing S3 env vars. Set S3_BUCKET_NAME, S3_BUCKET_URL, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY.',
  );
  process.exit(1);
}

const s3Client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
});

async function uploadTemplate() {
  const filePath = resolve(
    __dirname,
    '../templates/bulk-job-items-import-template.csv',
  );
  const buffer = readFileSync(filePath);
  const key = `uploads/${Date.now()}-bulk-job-items-import-template.csv`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: 'text/csv',
    }),
  );

  const url = `${BUCKET_URL}/${key}`;
  console.log('\n✅ Template uploaded successfully');
  console.log('URL:', url);
  console.log('\nCopy this URL into:');
  console.log('  vnp-scraper-frontend/src/configs/templates.config.ts');
  console.log('as the value for BULK_JOB_ITEMS_IMPORT_TEMPLATE.url\n');
}

uploadTemplate().catch((err) => {
  console.error('Upload failed:', err);
  process.exit(1);
});
