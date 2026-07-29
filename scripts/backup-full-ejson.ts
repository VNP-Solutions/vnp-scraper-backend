import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();

// NOTE: these are the raw MongoDB collection names (per each model's
// `@@map(...)` in prisma/schema.prisma), not the Prisma model names.
// This script queries the database directly via `$runCommandRaw`, which
// bypasses Prisma's model-to-collection mapping, so the real collection
// names must be used here. `ConnectedEntity` has no `@@map`, so its
// collection name matches the model name.
export const FULL_BACKUP_COLLECTION_ORDER = [
  'users',
  'ConnectedEntity',
  'portfolios',
  'sub_portfolios',
  'jobs',
  'recurring_jobs',
  'recurring_report_buckets',
  'properties',
  'property_credentials',
  'otps',
  'files',
  'user_feature_access_permissions',
  'user_invitations',
  'job_items',
  'card_activities',
  'activity_logs',
  'activity_log_exports',
  'otp_statuses',
  'phone_number_slots',
  'batches',
  'parent_retrievals',
  'retrievals',
  'retrieval_items',
  'db_datas',
  'db_entries',
  'notifications',
  'servers',
  'server_daily_schedules',
  'scheduled_jobs',
  'qa_panels',
  'qa_panel_ota_posts',
  'ota_post_pre_chargings',
] as const;

interface FullBackupOptions {
  folderPrefix?: string;
  updateLatestPointer?: boolean;
  dryRun?: boolean;
}

interface BackupManifest {
  backupDate: string;
  backupType: 'full-database-ejson';
  databaseName: string;
  sourceUrlRedacted: string;
  backupDir: string;
  totalCollections: number;
  totalDocuments: number;
  collections: Array<{
    name: string;
    file: string;
    count: number;
  }>;
  nodeVersion: string;
  platform: string;
}

function redactDatabaseUrl(dbUrl: string): string {
  return dbUrl.replace(/:[^:@]+@/, ':***@');
}

function getDatabaseName(dbUrl: string): string {
  const withoutQuery = dbUrl.split('?')[0];
  const parts = withoutQuery.split('/');
  const dbName = parts[parts.length - 1];
  return dbName && !dbName.includes('@') ? dbName : 'unknown';
}

async function listDatabaseCollections(): Promise<string[]> {
  const result = (await prisma.$runCommandRaw({
    listCollections: 1,
    nameOnly: true,
  })) as {
    cursor?: { firstBatch?: Array<{ name: string; type?: string }> };
  };

  return (result.cursor?.firstBatch ?? [])
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('system.'))
    .sort();
}

async function countDocuments(collectionName: string): Promise<number> {
  const result = (await prisma.$runCommandRaw({
    count: collectionName,
  })) as { n?: number };

  return result.n ?? 0;
}

async function fetchAllDocuments(collectionName: string): Promise<unknown[]> {
  const documents: unknown[] = [];
  const pageSize = 500;
  let lastId: unknown | undefined;

  while (true) {
    const filter: Record<string, unknown> = lastId
      ? { _id: { $gt: lastId } }
      : {};

    const result = (await prisma.$runCommandRaw({
      find: collectionName,
      filter: filter as never,
      sort: { _id: 1 },
      limit: pageSize,
      batchSize: pageSize,
      singleBatch: true,
    })) as {
      cursor?: { firstBatch?: Array<Record<string, unknown>> };
    };

    const batch = result.cursor?.firstBatch ?? [];
    if (batch.length === 0) {
      break;
    }

    documents.push(...batch);

    const nextLastId = batch[batch.length - 1]._id;
    if (nextLastId === lastId) {
      break;
    }

    lastId = nextLastId;
  }

  return documents;
}

async function backupFullDatabaseEjson(options?: FullBackupOptions) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const folderPrefix = options?.folderPrefix ?? 'full-backup';
  const updateLatestPointer = options?.updateLatestPointer ?? true;
  const dryRun = options?.dryRun ?? false;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(
    process.cwd(),
    'backups',
    `${folderPrefix}-${timestamp}`,
  );
  const collectionsDir = path.join(backupDir, 'collections');

  if (!dryRun) {
    fs.mkdirSync(collectionsDir, { recursive: true });
  }

  console.log('========================================');
  console.log(
    dryRun
      ? 'Full Database EJSON Backup [DRY RUN]'
      : 'Full Database EJSON Backup',
  );
  console.log('========================================');
  if (!dryRun) {
    console.log(`Backup directory: ${backupDir}\n`);
  } else {
    console.log('No files will be written; counting documents only.\n');
  }

  const collectionNames = await listDatabaseCollections();
  const orderedCollections = [
    ...FULL_BACKUP_COLLECTION_ORDER.filter((name) =>
      collectionNames.includes(name),
    ),
    ...collectionNames.filter(
      (name) => !FULL_BACKUP_COLLECTION_ORDER.includes(name as never),
    ),
  ];

  const unmappedCollections = collectionNames.filter(
    (name) => !FULL_BACKUP_COLLECTION_ORDER.includes(name as never),
  );
  if (unmappedCollections.length > 0) {
    console.log(
      `Note: ${unmappedCollections.length} collection(s) not present in FULL_BACKUP_COLLECTION_ORDER (will be exported last, alphabetically): ${unmappedCollections.join(', ')}\n`,
    );
  }

  const manifestCollections: BackupManifest['collections'] = [];
  let totalDocuments = 0;

  for (const collectionName of orderedCollections) {
    if (dryRun) {
      const count = await countDocuments(collectionName);
      console.log(`${collectionName}: ${count} record(s)`);
      manifestCollections.push({
        name: collectionName,
        file: `${collectionName}.ejson`,
        count,
      });
      totalDocuments += count;
      continue;
    }

    console.log(`Exporting ${collectionName}...`);
    const documents = await fetchAllDocuments(collectionName);
    const fileName = `${collectionName}.ejson`;

    fs.writeFileSync(
      path.join(collectionsDir, fileName),
      JSON.stringify(documents),
    );

    manifestCollections.push({
      name: collectionName,
      file: fileName,
      count: documents.length,
    });
    totalDocuments += documents.length;
    console.log(`  ${documents.length} record(s) exported`);
  }

  const manifest: BackupManifest = {
    backupDate: new Date().toISOString(),
    backupType: 'full-database-ejson',
    databaseName: getDatabaseName(dbUrl),
    sourceUrlRedacted: redactDatabaseUrl(dbUrl),
    backupDir,
    totalCollections: manifestCollections.length,
    totalDocuments,
    collections: manifestCollections,
    nodeVersion: process.version,
    platform: process.platform,
  };

  if (dryRun) {
    console.log('\n========================================');
    console.log('DRY RUN COMPLETE (nothing written to disk)');
    console.log('========================================');
    console.log(`Collections: ${manifest.totalCollections}`);
    console.log(`Documents: ${manifest.totalDocuments}\n`);

    return { success: true, backupDir, manifest };
  }

  const schemaSource = path.join(process.cwd(), 'prisma', 'schema.prisma');
  if (fs.existsSync(schemaSource)) {
    fs.copyFileSync(schemaSource, path.join(backupDir, 'schema.prisma'));
  }

  fs.writeFileSync(
    path.join(backupDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );

  if (updateLatestPointer) {
    fs.writeFileSync(
      path.join(process.cwd(), 'backups', 'latest-full-backup.txt'),
      backupDir,
    );
  }

  console.log('\n========================================');
  console.log('FULL EJSON BACKUP COMPLETED');
  console.log('========================================');
  console.log(`Location: ${backupDir}`);
  console.log(`Collections: ${manifest.totalCollections}`);
  console.log(`Documents: ${manifest.totalDocuments}\n`);

  return { success: true, backupDir, manifest };
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');

  backupFullDatabaseEjson({ dryRun })
    .catch((error) => {
      console.error('\nFULL EJSON BACKUP FAILED:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export default backupFullDatabaseEjson;
