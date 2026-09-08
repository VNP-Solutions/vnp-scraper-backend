#!/usr/bin/env ts-node

import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { OTAProvider, PrismaClient } from '@prisma/client';
import { formatImportCompatibleDate } from '../src/common/utils/import-compatible-date.util';

config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();

const CSV_HEADERS = [
  'Property ID',
  'Expedia ID',
  'Property Name',
  'Portfolio Name',
  'Billing Type',
  'OTA',
  'Oldest Start Date',
  'Latest End Date',
] as const;

type CsvRow = Record<(typeof CSV_HEADERS)[number], string>;

type JobGroupKey = string;

interface JobGroup {
  propertyId: string;
  propertyName: string;
  portfolioName: string;
  billingType: 'VCC' | 'DB';
  ota: OTAProvider;
  expediaId: string;
  oldestStartMs: number | null;
  latestEndMs: number | null;
}

function parseJobDate(value: string | null | undefined): number | null {
  const formatted = formatImportCompatibleDate(value);
  if (!formatted) return null;

  const slashMatch = formatted.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!slashMatch) return null;

  const [, mm, dd, yyyy] = slashMatch;
  const parsed = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeBillingType(value: string | null | undefined): 'VCC' | 'DB' {
  const normalized = (value ?? '').trim().toUpperCase();
  return normalized === 'DB' ? 'DB' : 'VCC';
}

function buildGroupKey(
  propertyId: string,
  billingType: 'VCC' | 'DB',
  ota: OTAProvider,
): JobGroupKey {
  return `${propertyId}::${billingType}::${ota}`;
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows: CsvRow[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      CSV_HEADERS.map((header) => escapeCsvCell(row[header])).join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

function formatDateFromMs(value: number | null): string {
  if (value === null) return '';
  const date = new Date(value);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

async function main() {
  console.log('Exporting property job date ranges...');

  await prisma.$connect();

  const jobs = await prisma.job.findMany({
    where: {
      property_id: { not: null },
    },
    select: {
      property_id: true,
      property_name: true,
      portfolio_name: true,
      billing_type: true,
      ota_provider: true,
      start_date: true,
      end_date: true,
      property: {
        select: {
          id: true,
          name: true,
          expedia_id: true,
          portfolio: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  console.log(`Loaded ${jobs.length} job(s) with a linked property.`);

  const groups = new Map<JobGroupKey, JobGroup>();

  for (const job of jobs) {
    if (!job.property_id) continue;

    const billingType = normalizeBillingType(job.billing_type);
    const groupKey = buildGroupKey(
      job.property_id,
      billingType,
      job.ota_provider,
    );
    const propertyName = job.property?.name || job.property_name || '';
    const portfolioName =
      job.property?.portfolio?.name || job.portfolio_name || '';
    const expediaId =
      job.property?.expedia_id !== null &&
      job.property?.expedia_id !== undefined
        ? String(job.property.expedia_id)
        : '';

    const startMs = parseJobDate(job.start_date);
    const endMs = parseJobDate(job.end_date);

    const existing = groups.get(groupKey);
    if (!existing) {
      groups.set(groupKey, {
        propertyId: job.property_id,
        propertyName,
        portfolioName,
        billingType,
        ota: job.ota_provider,
        expediaId,
        oldestStartMs: startMs,
        latestEndMs: endMs,
      });
      continue;
    }

    if (startMs !== null) {
      existing.oldestStartMs =
        existing.oldestStartMs === null
          ? startMs
          : Math.min(existing.oldestStartMs, startMs);
    }

    if (endMs !== null) {
      existing.latestEndMs =
        existing.latestEndMs === null
          ? endMs
          : Math.max(existing.latestEndMs, endMs);
    }
  }

  const rows: CsvRow[] = Array.from(groups.values())
    .sort((a, b) => {
      const propertyCompare = a.propertyName.localeCompare(b.propertyName);
      if (propertyCompare !== 0) return propertyCompare;
      const billingCompare = a.billingType.localeCompare(b.billingType);
      if (billingCompare !== 0) return billingCompare;
      return a.ota.localeCompare(b.ota);
    })
    .map((group) => ({
      'Property ID': group.propertyId,
      'Expedia ID': group.expediaId,
      'Property Name': group.propertyName,
      'Portfolio Name': group.portfolioName,
      'Billing Type': group.billingType,
      OTA: group.ota,
      'Oldest Start Date': formatDateFromMs(group.oldestStartMs),
      'Latest End Date': formatDateFromMs(group.latestEndMs),
    }));

  const outputDir = path.resolve(process.cwd(), 'exports');
  fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(
    outputDir,
    `property-job-date-ranges-${timestamp}.csv`,
  );

  fs.writeFileSync(outputPath, toCsv(rows), 'utf8');

  console.log(`Wrote ${rows.length} row(s) to ${outputPath}`);
}

main()
  .catch((error) => {
    console.error('Export failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
