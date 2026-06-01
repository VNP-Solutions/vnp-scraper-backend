import * as archiver from 'archiver';
import { PassThrough, Readable, Writable } from 'stream';

/**
 * Builds a ZIP buffer from an array of in-memory file entries. The order
 * of entries inside the ZIP is preserved.
 *
 * Used by both `/jobs/export-master` and `/reports/export-master` to bundle
 * per-job / per-retrieval files into a single downloadable archive.
 */
export function zipFiles(
  files: Array<{ name: string; data: Buffer }>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    const sink = new PassThrough();

    sink.on('data', (chunk: Buffer) => chunks.push(chunk));
    sink.on('end', () => resolve(Buffer.concat(chunks)));
    sink.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', (err: any) => {
      if (err?.code === 'ENOENT') {
        // Soft warning — log via caller if they wish.
        return;
      }
      reject(err);
    });

    archive.pipe(sink);
    for (const file of files) {
      archive.append(file.data, { name: file.name });
    }
    void archive.finalize();
  });
}

/**
 * Streaming variant of `zipFiles`: bundles entries into a ZIP and
 * pipes the result into the provided `writable` as it's being built.
 * Memory stays bounded by the size of the largest single entry (plus
 * archiver's internal compression buffer), so this is safe to use for
 * exports that would OOM if held entirely in RAM.
 *
 * The `entries` callback receives two helpers:
 *   - `appendBuffer(name, data)` — append a pre-built in-memory buffer.
 *   - `appendStream(name, readable)` — true-stream an entry: archiver
 *     reads from `readable` as bytes are produced, with no intermediate
 *     buffer held in Node heap. MUST be awaited before the next call so
 *     archiver's internal queue processes entries one-at-a-time.
 *
 * Compression level is set to 1 (fastest / least CPU) instead of the
 * default 9. For per-job XLSX entries the size difference is negligible
 * and the speed difference is enormous (level 9 can be 10-20× slower).
 */
export function streamZipEntries(
  writable: Writable,
  entries: (api: {
    appendBuffer: (name: string, data: Buffer) => void;
    appendStream: (name: string, readable: Readable) => Promise<void>;
  }) => Promise<void>,
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 1 } });

    archive.on('error', reject);
    archive.on('warning', (err: any) => {
      if (err?.code === 'ENOENT') return; // soft warning, ignore
      reject(err);
    });
    archive.on('end', () => resolve());

    archive.pipe(writable);

    const api = {
      appendBuffer: (name: string, data: Buffer) => {
        archive.append(data, { name });
      },
      /**
       * Append a readable stream as a ZIP entry and wait until archiver
       * has fully consumed and compressed it. Archiver processes entries
       * sequentially, so awaiting this before the next call ensures
       * back-pressure flows correctly: we never queue up a second entry
       * while the first is still being compressed.
       */
      appendStream: (name: string, readable: Readable): Promise<void> => {
        return new Promise<void>((res, rej) => {
          const onEntry = () => {
            archive.off('error', onError);
            res();
          };
          const onError = (err: Error) => {
            archive.off('entry', onEntry);
            rej(err);
          };
          archive.once('entry', onEntry);
          archive.once('error', onError);
          archive.append(readable, { name });
        });
      },
    };

    try {
      await entries(api);
      await archive.finalize();
    } catch (err) {
      reject(err);
      try {
        archive.abort();
      } catch {
        // ignore
      }
    }
  });
}

/**
 * Produces a filename-safe, locale-neutral timestamp like
 * `"23 April 2026-04.44 PM"`. A dot is used as the time separator
 * instead of `:` so the filename is valid on Windows / macOS / Linux.
 */
export function buildHumanReadableTimestamp(d: Date = new Date()): string {
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'long' });
  const year = d.getFullYear();
  const time = d
    .toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
    .replace(':', '.');
  return `${day} ${month} ${year}-${time}`;
}

/**
 * Strips characters that are invalid in filenames on any common OS, and
 * collapses internal whitespace to a single space. Returns `'unknown'`
 * if the input is empty / whitespace-only.
 */
export function sanitizeForFilename(value: string): string {
  const cleaned = (value ?? '')
    .toString()
    .trim()
    .replace(/[\/\\:*?"<>|\x00-\x1f]+/g, '_')
    .replace(/\s+/g, ' ');
  return cleaned.length > 0 ? cleaned : 'unknown';
}

/**
 * If `name` is already taken in `used`, returns `<base>-2<ext>`,
 * `<base>-3<ext>`, etc. until a free slot is found. Mutates `used` to
 * mark the returned name as taken.
 */
export function ensureUniqueFilename(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot >= 0 ? name.slice(0, dot) : name;
  const ext = dot >= 0 ? name.slice(dot) : '';
  let counter = 2;
  let candidate = `${base}-${counter}${ext}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${base}-${counter}${ext}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Best-effort conversion of an `MM/DD/YYYY` (or any) date string into a
 * filename-safe form by replacing slashes / whitespace with `-`.
 * Returns `'NA'` for empty values.
 */
export function formatDateForFilename(value: string | null | undefined): string {
  const raw = (value ?? '').toString().trim();
  if (!raw) return 'NA';
  return raw.replace(/[\/\\:*?"<>|\s]+/g, '-');
}
