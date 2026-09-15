import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Prisma cannot `@default([])` a composite list, so reading a
 * `card_activities` document that predates `settlements` throws.
 * This writes `settlements: []` onto those rows only — no invented
 * settlement data, and no changes to job_items VCC fields.
 *
 *   npx ts-node migrations/add-card-activity-settlements.ts
 *   npm run migrate:card-activity-settlements
 */
async function addCardActivitySettlements() {
  console.log('Starting card_activities.settlements backfill...');

  try {
    await prisma.$connect();

    const result = await prisma.$runCommandRaw({
      update: 'card_activities',
      updates: [
        {
          q: { settlements: { $exists: false } },
          u: { $set: { settlements: [] } },
          multi: true,
        },
      ],
    });

    const modifiedCount = Number(result.nModified) || 0;
    const matchedCount = Number(result.nMatched) || 0;
    console.log(`Matched: ${matchedCount}; updated: ${modifiedCount}`);

    const remaining = await prisma.$runCommandRaw({
      count: 'card_activities',
      query: { settlements: { $exists: false } },
    });
    const remainingWithoutField = Number(remaining.n) || 0;
    if (remainingWithoutField > 0) {
      console.warn(
        `${remainingWithoutField} document(s) still missing settlements`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  addCardActivitySettlements()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export { addCardActivitySettlements };
