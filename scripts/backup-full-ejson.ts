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

// Documents are streamed to disk one page at a time as newline-delimited
// JSON (one document per line) rather than collected into memory and
// written as a single JSON array. Production collections here can be very
// large (e.g. job_items: 1M+ records, 16GB+) - materializing that into one
// JS array and then `JSON.stringify`-ing it in one shot would exhaust
// Node's heap long before finishing. Streaming keeps memory usage bounded
// to roughly one page, regardless of collection size.
export const DOCUMENT_FORMAT = 'ndjson' as const;

// A `find` command's response is capped by MongoDB at the same ~16MB per
// message as any other command, but unlike `insert`, the server handles
// this gracefully by returning fewer documents than requested rather than
// erroring - so a generous page size here is safe. It just reduces the
// number of network round-trips, which is the dominant cost for large
// collections of small documents (e.g. job_items averaged ~850
// bytes/record in production: 1M+ records at a fixed small page size would
// mean an unnecessarily large number of round-trips to Atlas).
//
// Rather than guess one fixed page size for every collection - which would
// be too small for tiny-document collections (wasting round-trips) and
// risks being too large for collections with big embedded arrays
// (Retrieval.reservations, QaPanel.failed_reasons, see
// dump-and-restore-backup.ts for the full schema analysis) - the page size
// is computed per collection from MongoDB's own `avgObjSize` stat, targeting
// ~8MB of data per page (well under the ~16MB response cap, leaving room
// for estimation error). Falls back to a safe fixed size if stats are
// unavailable for any reason.
const TARGET_PAGE_BYTES = 8 * 1024 * 1024;
const MIN_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 5000;
const DEFAULT_PAGE_SIZE = 2000;

// How many collections are exported concurrently. Independent collections
// have no ordering dependency during backup (unlike restore, where insert
// order matters), so the ~30 small collections don't need to wait in a
// single-file queue behind the couple of huge ones (job_items,
// card_activities) - they run alongside them instead. Kept modest to stay
// well within the MongoDB driver's connection pool.
const EXPORT_CONCURRENCY = 4;

// Network calls to Atlas can transiently fail (blips, timeouts) during a
// backup that may run for a long time against a large production database.
// Retrying with backoff avoids having to restart a multi-hour export of a
// 16GB collection over one hiccup.
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  retries = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt > retries) {
        throw error;
      }
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      console.log(
        `    ${label}: transient error (attempt ${attempt}/${retries}), retrying in ${delayMs}ms: ${error instanceof Error ? error.message : error}`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function getAdaptivePageSize(collectionName: string): Promise<number> {
  try {
    const stats = (await withRetry(
      () => prisma.$runCommandRaw({ collStats: collectionName }),
      `collStats(${collectionName})`,
    )) as { avgObjSize?: number };

    const avgObjSize = stats.avgObjSize ?? 0;
    if (!avgObjSize || avgObjSize <= 0) {
      return DEFAULT_PAGE_SIZE;
    }

    const estimated = Math.floor(TARGET_PAGE_BYTES / avgObjSize);
    return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, estimated));
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

// Rolling bounded-concurrency worker pool: each worker picks up the next
// item as soon as it's free, so a handful of huge collections running
// alongside many tiny ones doesn't waste concurrency slots waiting for
// evenly-sized batches.
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  let firstError: unknown = null;

  async function runNext(): Promise<void> {
    while (true) {
      if (firstError) return;
      const index = nextIndex++;
      if (index >= items.length) return;

      try {
        await worker(items[index]);
      } catch (error) {
        if (!firstError) firstError = error;
        return;
      }
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));

  if (firstError) {
    throw firstError;
  }
}

interface FullBackupOptions {
  folderPrefix?: string;
  updateLatestPointer?: boolean;
  dryRun?: boolean;
}

interface BackupManifest {
  backupDate: string;
  backupType: 'full-database-ejson';
  documentFormat: typeof DOCUMENT_FORMAT;
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

function writeToStream(stream: fs.WriteStream, chunk: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const canWriteMore = stream.write(chunk, (err) => {
      if (err) reject(err);
    });

    if (canWriteMore) {
      resolve();
    } else {
      // Backpressure: wait for the stream to catch up before requesting the
      // next page, so a fast DB reader can't outrun a slower disk writer
      // and buffer an unbounded amount of data in memory.
      stream.once('drain', resolve);
    }
  });
}

function closeStream(stream: fs.WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.end(() => resolve());
  });
}

async function exportCollectionToNdjson(
  collectionName: string,
  destPath: string,
): Promise<number> {
  const stream = fs.createWriteStream(destPath, { encoding: 'utf8' });
  const pageSize = await getAdaptivePageSize(collectionName);
  let lastId: unknown | undefined;
  let count = 0;

  try {
    while (true) {
      const filter: Record<string, unknown> = lastId
        ? { _id: { $gt: lastId } }
        : {};

      const result = (await withRetry(
        () =>
          prisma.$runCommandRaw({
            find: collectionName,
            filter: filter as never,
            sort: { _id: 1 },
            limit: pageSize,
            batchSize: pageSize,
            singleBatch: true,
          }),
        `find(${collectionName})`,
      )) as {
        cursor?: { firstBatch?: Array<Record<string, unknown>> };
      };

      const batch = result.cursor?.firstBatch ?? [];
      if (batch.length === 0) {
        break;
      }

      const lines = batch.map((doc) => JSON.stringify(doc)).join('\n') + '\n';
      await writeToStream(stream, lines);
      count += batch.length;

      const nextLastId = batch[batch.length - 1]._id;
      if (nextLastId === lastId) {
        break;
      }

      lastId = nextLastId;

      if (count % (pageSize * 10) === 0) {
        console.log(`    [${collectionName}] ...${count} record(s) so far`);
      }
    }
  } finally {
    await closeStream(stream);
  }

  return count;
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

  if (dryRun) {
    for (const collectionName of orderedCollections) {
      const count = await countDocuments(collectionName);
      console.log(`${collectionName}: ${count} record(s)`);
      manifestCollections.push({
        name: collectionName,
        file: `${collectionName}.ejson`,
        count,
      });
      totalDocuments += count;
    }
  } else {
    // Collections are independent during backup (unlike restore, where
    // insert order matters), so they're exported with bounded concurrency
    // rather than one at a time - the many small collections don't have to
    // wait behind job_items/card_activities. Results are collected by name
    // and re-assembled into `orderedCollections`' canonical order afterward,
    // since concurrent completion order isn't the same as that order.
    const results = new Map<string, { file: string; count: number }>();

    await runWithConcurrency(
      [...orderedCollections],
      EXPORT_CONCURRENCY,
      async (collectionName) => {
        console.log(`Exporting ${collectionName}...`);
        const startedAt = Date.now();
        const fileName = `${collectionName}.ejson`;
        const count = await exportCollectionToNdjson(
          collectionName,
          path.join(collectionsDir, fileName),
        );
        const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

        results.set(collectionName, { file: fileName, count });
        console.log(
          `  [${collectionName}] ${count} record(s) exported (${elapsedSec}s)`,
        );
      },
    );

    for (const collectionName of orderedCollections) {
      const result = results.get(collectionName);
      if (!result) continue;

      manifestCollections.push({
        name: collectionName,
        file: result.file,
        count: result.count,
      });
      totalDocuments += result.count;
    }
  }

  const manifest: BackupManifest = {
    backupDate: new Date().toISOString(),
    backupType: 'full-database-ejson',
    documentFormat: DOCUMENT_FORMAT,
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
