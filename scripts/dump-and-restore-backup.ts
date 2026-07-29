/**
 * Dump the current database, then restore from a backup in ./backups.
 *
 * Usage:
 *   npm run backup:restore                                # dry-run (shows plan)
 *   npm run backup:restore -- --apply                      # dump current DB, then restore
 *   npm run backup:restore -- --apply --skip-dump           # restore only
 *   npm run backup:restore -- --apply --backup=./backups/full-backup-...
 *   npm run backup:restore -- --apply --keep-indexes        # slower, but never drops indexes
 */
import { config } from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { PrismaClient } from '@prisma/client';
import backupFullDatabaseEjson, {
  FULL_BACKUP_COLLECTION_ORDER,
} from './backup-full-ejson';

config({ path: path.resolve(process.cwd(), '.env') });

const execAsync = promisify(exec);
const prisma = new PrismaClient();

type BackupType = 'full-ejson' | 'mongodump';
type DocumentFormat = 'ndjson' | 'json-array';

interface BackupManifest {
  backupType?: string;
  documentFormat?: string;
  collections?: Array<{
    name: string;
    file: string;
    count: number;
  }>;
}

interface BackupSource {
  type: BackupType;
  dir: string;
  restorePath: string;
  manifest?: BackupManifest;
}

interface CliOptions {
  apply: boolean;
  skipDump: boolean;
  backupPath?: string;
  keepIndexes: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const backupArg = args.find((arg) => arg.startsWith('--backup='));

  return {
    apply: args.includes('--apply'),
    skipDump: args.includes('--skip-dump'),
    keepIndexes: args.includes('--keep-indexes'),
    backupPath: backupArg
      ? path.resolve(process.cwd(), backupArg.slice('--backup='.length))
      : undefined,
  };
}

function readManifest(backupDir: string): BackupManifest | undefined {
  const manifestPath = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return undefined;
  }

  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest;
}

function getDirectoryTimestamp(name: string): string {
  const match = name.match(/(\d{4}-\d{2}-\d{2}T[\d-]+Z?)/);
  return match?.[1] ?? name;
}

function detectBackupType(backupDir: string): BackupSource | null {
  const manifest = readManifest(backupDir);
  const collectionsDir = path.join(backupDir, 'collections');

  if (
    manifest?.backupType === 'full-database-ejson' &&
    fs.existsSync(collectionsDir)
  ) {
    return {
      type: 'full-ejson',
      dir: backupDir,
      restorePath: collectionsDir,
      manifest,
    };
  }

  const mongodumpDir = path.join(backupDir, 'mongodb-dump');
  if (fs.existsSync(mongodumpDir) && fs.statSync(mongodumpDir).isDirectory()) {
    const dbDirs = fs
      .readdirSync(mongodumpDir)
      .filter((entry) =>
        fs.statSync(path.join(mongodumpDir, entry)).isDirectory(),
      );

    if (dbDirs.length > 0) {
      return {
        type: 'mongodump',
        dir: backupDir,
        restorePath: mongodumpDir,
      };
    }
  }

  return null;
}

function getLatestFullBackupFromPointer(): string | null {
  const pointerFile = path.join(
    process.cwd(),
    'backups',
    'latest-full-backup.txt',
  );
  if (!fs.existsSync(pointerFile)) {
    return null;
  }

  const backupDir = fs.readFileSync(pointerFile, 'utf8').trim();
  return fs.existsSync(backupDir) ? backupDir : null;
}

function findLatestFullBackup(backupsRoot: string): BackupSource | null {
  if (!fs.existsSync(backupsRoot)) {
    return null;
  }

  const candidates = fs
    .readdirSync(backupsRoot)
    .filter((name) => {
      const fullPath = path.join(backupsRoot, name);
      return (
        fs.statSync(fullPath).isDirectory() &&
        name.startsWith('full-backup-') &&
        !name.startsWith('safety-')
      );
    })
    .map((name) => {
      const fullPath = path.join(backupsRoot, name);
      const source = detectBackupType(fullPath);
      return source ? { name, source } : null;
    })
    .filter(
      (entry): entry is { name: string; source: BackupSource } =>
        entry !== null,
    )
    .sort((a, b) =>
      getDirectoryTimestamp(b.name).localeCompare(
        getDirectoryTimestamp(a.name),
      ),
    );

  return candidates[0]?.source ?? null;
}

function resolveBackupSource(explicitPath?: string): BackupSource {
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      throw new Error(`Backup path not found: ${explicitPath}`);
    }

    const source = detectBackupType(explicitPath);
    if (!source) {
      throw new Error(
        `No restorable backup found at ${explicitPath}. Expected a full-backup (EJSON) or mongodb-dump folder.`,
      );
    }

    return source;
  }

  const pointerBackup = getLatestFullBackupFromPointer();
  if (pointerBackup) {
    const source = detectBackupType(pointerBackup);
    if (source) {
      return source;
    }
  }

  const latestFullBackup = findLatestFullBackup(
    path.join(process.cwd(), 'backups'),
  );
  if (latestFullBackup) {
    return latestFullBackup;
  }

  throw new Error(
    'No restorable full backup found in ./backups. Add a full-backup-* folder or latest-full-backup.txt pointer.',
  );
}

function listFullEjsonCollections(source: BackupSource): string[] {
  const manifestCollections =
    source.manifest?.collections?.map((collection) => collection.name) ?? [];

  const available = new Set(
    fs
      .readdirSync(source.restorePath)
      .filter((file) => file.endsWith('.ejson'))
      .map((file) => file.replace(/\.ejson$/, '')),
  );

  const ordered = FULL_BACKUP_COLLECTION_ORDER.filter((name) =>
    available.has(name),
  );
  const extras = [...available].filter(
    (name) => !FULL_BACKUP_COLLECTION_ORDER.includes(name as never),
  );

  if (manifestCollections.length > 0) {
    const orderedFromManifest = manifestCollections.filter((name) =>
      available.has(name),
    );
    const missingFromManifest = [...available].filter(
      (name) => !orderedFromManifest.includes(name),
    );
    return [...orderedFromManifest, ...missingFromManifest];
  }

  return [...ordered, ...extras];
}

function getDocumentFormat(source: BackupSource): DocumentFormat {
  // Backups written before the NDJSON streaming format was introduced have
  // no `documentFormat` field and store each collection as one big JSON
  // array. New backups (see backup-full-ejson.ts) set `documentFormat:
  // 'ndjson'`. Both are supported here so old backups keep working.
  return source.manifest?.documentFormat === 'ndjson' ? 'ndjson' : 'json-array';
}

async function isMongodumpAvailable(): Promise<boolean> {
  try {
    await execAsync('mongodump --version', { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

async function createSafetyDump(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl && (await isMongodumpAvailable())) {
    console.log('Using mongodump for safety backup...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(
      process.cwd(),
      'backups',
      `safety-mongodump-${timestamp}`,
    );
    fs.mkdirSync(backupDir, { recursive: true });

    const command = `mongodump --uri="${dbUrl}" --out="${path.join(backupDir, 'mongodb-dump')}"`;
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 10,
    });

    if (stdout) console.log(stdout);
    if (stderr) console.log(stderr);

    console.log(`Safety mongodump completed: ${backupDir}`);
    return;
  }

  console.log('mongodump not found; using full EJSON safety backup instead...');
  await backupFullDatabaseEjson({
    folderPrefix: 'safety-full-backup',
    updateLatestPointer: false,
  });
}

async function restoreFromMongodump(
  restorePath: string,
  dbUrl: string,
): Promise<void> {
  console.log('\nRestoring MongoDB dump with mongorestore...');
  console.log(`Source: ${restorePath}`);

  const command = `mongorestore --uri="${dbUrl}" --drop "${restorePath}"`;
  const { stdout, stderr } = await execAsync(command, {
    maxBuffer: 1024 * 1024 * 20,
  });

  if (stdout) console.log(stdout);
  if (stderr) console.log(stderr);

  console.log('MongoDB restore completed.');
}

// --- Fast collection clearing ------------------------------------------
//
// `deleteMany({})` on a multi-million-document collection has to visit
// every document and update every index on it one at a time - for a
// collection like job_items (1M+ records, several indexes each), this can
// take a very long time. `drop` removes the collection (and its indexes)
// in one near-instant metadata operation; MongoDB recreates it implicitly
// on the next insert. The tradeoff is that the collection's indexes
// (unique constraints, @@index) are gone until rebuilt - so by default we
// drop for speed and rebuild every index afterwards in one pass via
// `prisma db push` (bulk-load-then-index is the standard fast pattern for
// large restores; building an index once at the end is much cheaper than
// maintaining it incrementally during a huge insert). Pass --keep-indexes
// to fall back to the slower delete-based clearing if that tradeoff isn't
// wanted (e.g. you can't run `prisma db push` in this environment).
async function clearCollection(
  collectionName: string,
  keepIndexes: boolean,
): Promise<void> {
  if (keepIndexes) {
    await prisma.$runCommandRaw({
      delete: collectionName,
      deletes: [{ q: {}, limit: 0 }],
    });
    return;
  }

  try {
    await prisma.$runCommandRaw({ drop: collectionName });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Collection doesn't exist yet on a fresh target database - fine, insert
    // will create it.
    if (!/ns not found/i.test(message)) {
      throw error;
    }
  }
}

async function rebuildIndexes(): Promise<void> {
  console.log(
    '\nRebuilding indexes from prisma/schema.prisma (npx prisma db push)...',
  );
  try {
    const { stdout, stderr } = await execAsync(
      'npx prisma db push --skip-generate --accept-data-loss',
      { cwd: process.cwd(), maxBuffer: 1024 * 1024 * 10 },
    );
    if (stdout) console.log(stdout);
    if (stderr) console.log(stderr);
    console.log('Indexes rebuilt successfully.');
  } catch (error) {
    console.error(
      '\n⚠ WARNING: Failed to rebuild indexes automatically after restore.',
    );
    console.error(
      'Data was restored, but collections were dropped and recreated WITHOUT their indexes',
    );
    console.error(
      '(unique constraints will not be enforced and queries will be slow until fixed).',
    );
    console.error('Run this manually now: npx prisma db push');
    console.error(error instanceof Error ? error.message : error);
  }
}

// --- Chunked, concurrent inserts ---------------------------------------
//
// MongoDB enforces a hard ~16MB limit on the *entire* raw `insert` command
// document (all `documents` combined into one BSON message), not per
// document. This is what broke the original single-shot insert: high-volume
// collections like job_items (1M+ records in production) blow past that
// ceiling even though each individual record is small (job_items averaged
// ~850 bytes/record). Documents are therefore streamed through in batches.
//
// Sizing rationale (from prisma/schema.prisma, not an arbitrary number):
//   - Mongo's real limit reported by the driver was 16,809,984 bytes
//     (~16.03MB). We budget well under that to leave room for the command
//     envelope ("insert"/"documents"/"ordered" wrapper) and for the fact
//     that BSON wire overhead per document (type tags, length prefixes)
//     isn't reflected in our JSON.stringify-based size estimate.
//   - Most models are flat/small (ActivityLog, DbEntry, ScheduledJob, etc.)
//     or have small bounded embedded objects (JobItem/RetrievalItem's
//     card_info + payment_info). For those, the 1000-doc cap below is what
//     actually limits batch size in practice.
//   - A few models embed genuinely unbounded arrays that can make a single
//     document large on their own: Retrieval.reservations (one entry per
//     reservation scraped by a job - the biggest per-document risk in the
//     schema), QaPanel/QaPanelOtaPost.failed_reasons (one entry per failed
//     row in a bulk upload), and CardActivity.authorizations (one entry per
//     charge/decline attempt). A 6MB batch budget leaves >10MB of headroom
//     under Mongo's real limit, so even a batch containing one unusually
//     large Retrieval/QaPanel document alongside others has room to spare.
const MAX_INSERT_BATCH_BYTES = 6 * 1024 * 1024;
const MAX_INSERT_BATCH_DOCS = 1000;

// MongoDB also enforces a hard 16MB limit on a single document, independent
// of batching - no amount of chunking can split one oversized document. Given
// the unbounded fields above (esp. Retrieval.reservations), fail fast with a
// clear message instead of letting a cryptic BSONObjectTooLarge error surface
// from the driver.
const MAX_SINGLE_DOCUMENT_BYTES = 15 * 1024 * 1024;

// How many insert batches can be in flight at once for a single collection.
// This overlaps network round-trip latency to Atlas across batches instead
// of paying it serially for every batch - important for collections with
// hundreds/thousands of batches (e.g. 1M job_items / ~1000 docs per batch =
// ~1000 batches). Kept modest to stay well within Prisma's/the Mongo
// driver's connection pool and avoid overwhelming the target cluster.
const INSERT_CONCURRENCY = 4;

// Streams documents (from either format) through size/count-aware batching
// with bounded insert concurrency, without ever holding the whole
// collection in memory - required for multi-GB, million-plus-document
// collections like job_items in production.
class BatchInserter {
  private currentBatch: unknown[] = [];
  private currentBatchBytes = 0;
  private readonly inFlight = new Set<Promise<void>>();
  private firstError: unknown = null;
  private totalDocs = 0;
  private totalBatches = 0;

  constructor(private readonly collectionName: string) {}

  async add(doc: unknown): Promise<void> {
    if (this.firstError) {
      throw this.firstError;
    }

    const docBytes = Buffer.byteLength(JSON.stringify(doc), 'utf8');

    if (docBytes > MAX_SINGLE_DOCUMENT_BYTES) {
      const id = (doc as { _id?: unknown })?._id;
      throw new Error(
        `Document in ${this.collectionName} (_id: ${JSON.stringify(id)}) is ~${(docBytes / (1024 * 1024)).toFixed(1)}MB, ` +
          `which exceeds MongoDB's single-document limit. This cannot be fixed by batching - ` +
          `check for an unbounded embedded array (e.g. reservations, failed_reasons, authorizations) on this record.`,
      );
    }

    if (
      this.currentBatch.length > 0 &&
      (this.currentBatch.length >= MAX_INSERT_BATCH_DOCS ||
        this.currentBatchBytes + docBytes > MAX_INSERT_BATCH_BYTES)
    ) {
      await this.dispatchCurrentBatch();
    }

    this.currentBatch.push(doc);
    this.currentBatchBytes += docBytes;
    this.totalDocs++;
  }

  private async dispatchCurrentBatch(): Promise<void> {
    if (this.currentBatch.length === 0) {
      return;
    }

    const batch = this.currentBatch;
    this.currentBatch = [];
    this.currentBatchBytes = 0;
    this.totalBatches++;

    if (this.inFlight.size >= INSERT_CONCURRENCY) {
      await Promise.race(this.inFlight);
      if (this.firstError) {
        throw this.firstError;
      }
    }

    const promise: Promise<void> = prisma
      .$runCommandRaw({
        insert: this.collectionName,
        documents: batch as never,
        ordered: false,
      })
      .then(() => undefined)
      .catch((error) => {
        if (!this.firstError) {
          this.firstError = error;
        }
      })
      .finally(() => {
        this.inFlight.delete(promise);
      });

    this.inFlight.add(promise);
  }

  async finish(): Promise<{ totalDocs: number; totalBatches: number }> {
    await this.dispatchCurrentBatch();
    await Promise.all(this.inFlight);

    if (this.firstError) {
      throw this.firstError;
    }

    return { totalDocs: this.totalDocs, totalBatches: this.totalBatches };
  }
}

async function* readNdjsonDocuments(filePath: string): AsyncGenerator<unknown> {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    yield JSON.parse(trimmed);
  }
}

// Kept only for backward compatibility with backups made before the NDJSON
// streaming format existed. Loads the whole file/array into memory, same as
// before - acceptable for the smaller legacy backups this applies to, but
// new backups always use the NDJSON path above.
async function* readLegacyJsonArrayDocuments(
  filePath: string,
): AsyncGenerator<unknown> {
  const documents = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown[];
  for (const doc of documents) {
    yield doc;
  }
}

async function restoreCollectionDocuments(
  collectionName: string,
  filePath: string,
  format: DocumentFormat,
): Promise<{ totalDocs: number; totalBatches: number }> {
  const inserter = new BatchInserter(collectionName);
  const documents =
    format === 'ndjson'
      ? readNdjsonDocuments(filePath)
      : readLegacyJsonArrayDocuments(filePath);

  for await (const doc of documents) {
    await inserter.add(doc);
  }

  return inserter.finish();
}

async function restoreFromFullEjson(
  source: BackupSource,
  keepIndexes: boolean,
): Promise<void> {
  const collections = listFullEjsonCollections(source);
  if (collections.length === 0) {
    throw new Error(`No .ejson files found in ${source.restorePath}`);
  }

  const format = getDocumentFormat(source);

  console.log('\nRestoring full EJSON backup via Prisma...');
  console.log(`Source: ${source.dir}`);
  console.log(`Format: ${format}`);
  console.log(`Collections: ${collections.length}`);
  console.log(
    `Clearing strategy: ${keepIndexes ? 'delete-all (indexes kept)' : 'drop + rebuild indexes at the end (faster for large collections)'}`,
  );

  for (const collectionName of [...collections].reverse()) {
    const fileName =
      source.manifest?.collections?.find(
        (collection) => collection.name === collectionName,
      )?.file ?? `${collectionName}.ejson`;
    const filePath = path.join(source.restorePath, fileName);

    console.log(`  Clearing ${collectionName}...`);
    await clearCollection(collectionName, keepIndexes);

    const startedAt = Date.now();
    const { totalDocs, totalBatches } = await restoreCollectionDocuments(
      collectionName,
      filePath,
      format,
    );
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

    if (totalDocs === 0) {
      console.log(`  ${collectionName}: 0 records`);
      continue;
    }

    console.log(
      `  ${collectionName}: ${totalDocs} record(s) restored across ${totalBatches} batch(es) (${elapsedSec}s)`,
    );
  }

  console.log('Full EJSON restore completed.');
}

async function countCollection(collectionName: string): Promise<number> {
  const result = (await prisma.$runCommandRaw({
    count: collectionName,
    query: {},
  })) as { n?: number };

  return result.n ?? 0;
}

async function verifyRestore(source: BackupSource): Promise<void> {
  console.log('\nVerifying restored collections...');

  if (source.type === 'full-ejson') {
    for (const collectionName of listFullEjsonCollections(source)) {
      const expected =
        source.manifest?.collections?.find(
          (collection) => collection.name === collectionName,
        )?.count ?? null;
      const actual = await countCollection(collectionName);
      const suffix =
        expected === null
          ? ''
          : expected === actual
            ? ''
            : ` (expected ${expected})`;
      console.log(`  ${collectionName.padEnd(35)} : ${actual}${suffix}`);
    }
    return;
  }

  const dbDirs = fs
    .readdirSync(source.restorePath)
    .filter((entry) =>
      fs.statSync(path.join(source.restorePath, entry)).isDirectory(),
    );

  for (const dbDir of dbDirs) {
    const files = fs.readdirSync(path.join(source.restorePath, dbDir));
    const bsonFiles = files.filter((file) => file.endsWith('.bson'));
    console.log(`  ${dbDir}: ${bsonFiles.length} collection file(s) in backup`);
  }
}

async function main() {
  const options = parseArgs();
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const source = resolveBackupSource(options.backupPath);

  console.log('========================================');
  console.log('Database Dump And Restore');
  console.log('========================================');
  console.log(`Mode: ${options.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Backup source: ${source.dir}`);
  console.log(`Backup type: ${source.type}`);

  if (source.type === 'full-ejson') {
    console.log(`Collections: ${listFullEjsonCollections(source).length}`);
    console.log(
      `Documents: ${source.manifest?.collections?.reduce((sum, item) => sum + item.count, 0) ?? 'unknown'}`,
    );
  } else {
    console.log(`Mongo dump path: ${source.restorePath}`);
  }

  if (!options.apply) {
    console.log('\nDry-run only. Re-run with --apply to:');
    if (!options.skipDump) {
      console.log(
        '  1. Create a safety dump of the current database in ./backups',
      );
    }
    console.log(
      `  ${options.skipDump ? '1' : '2'}. Restore from ${source.dir}`,
    );
    console.log('\nExamples:');
    console.log('  npm run backup:restore -- --apply');
    console.log('  npm run backup:restore -- --apply --skip-dump');
    console.log('  npm run backup:restore -- --apply --keep-indexes');
    console.log(
      '  npm run backup:restore -- --apply --backup=./backups/full-backup-2026-07-29T06-41-25-715Z',
    );
    return;
  }

  if (!options.skipDump) {
    console.log('\nPhase 1: Creating safety dump of current database...');
    await createSafetyDump();
  } else {
    console.log('\nPhase 1: Skipped (--skip-dump)');
  }

  console.log('\nPhase 2: Restoring from backup...');
  if (source.type === 'mongodump') {
    await restoreFromMongodump(source.restorePath, dbUrl);
  } else {
    await restoreFromFullEjson(source, options.keepIndexes);

    if (!options.keepIndexes) {
      await rebuildIndexes();
    }
  }

  await verifyRestore(source);

  console.log('\n========================================');
  console.log('Dump and restore completed successfully');
  console.log('========================================\n');
}

main()
  .catch((error) => {
    console.error('\nDump and restore failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
