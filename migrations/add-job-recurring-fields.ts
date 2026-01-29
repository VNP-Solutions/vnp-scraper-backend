import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Add recurring_id and schedule_date fields to jobs collection
 */
async function addJobRecurringFields() {
  console.log('🚀 Starting migration to add recurring_id and schedule_date fields to jobs...');

  try {
    // Connect to database
    console.log('\n📡 Connecting to database...');
    try {
      await prisma.$connect();
      console.log('✅ Database connected successfully');
    } catch (connectionError) {
      console.error('❌ Failed to connect to database:', connectionError);
      throw new Error(
        'Database connection failed. Please check your DATABASE_URL and database status.',
      );
    }

    console.log('\n🔍 Processing jobs collection...');

    // Step 1: Add recurring_id field (set to null for existing jobs)
    console.log('\n📋 Step 1: Adding recurring_id field...');
    const recurringIdResult = await prisma.$runCommandRaw({
      update: 'jobs',
      updates: [
        {
          q: { recurring_id: { $exists: false } },
          u: { $set: { recurring_id: null } },
          multi: true,
        },
      ],
    });

    const recurringIdModified = Number(recurringIdResult.nModified) || 0;
    const recurringIdMatched = Number(recurringIdResult.nMatched) || 0;

    console.log(`   📋 Documents matched (missing recurring_id): ${recurringIdMatched}`);
    console.log(`   ✅ Documents updated with recurring_id: ${recurringIdModified}`);

    // Verify recurring_id update
    const remainingWithoutRecurringId = await prisma.$runCommandRaw({
      count: 'jobs',
      query: { recurring_id: { $exists: false } },
    });

    const remainingRecurringIdCount = Number(remainingWithoutRecurringId.n) || 0;
    if (remainingRecurringIdCount > 0) {
      console.warn(
        `   ⚠️  Warning: ${remainingRecurringIdCount} job(s) still missing recurring_id field`,
      );
    } else {
      console.log('   ✅ Verification: All jobs now have recurring_id field');
    }

    // Step 2: Add schedule_date field (set to null for existing jobs)
    console.log('\n📋 Step 2: Adding schedule_date field...');
    const scheduleDateResult = await prisma.$runCommandRaw({
      update: 'jobs',
      updates: [
        {
          q: { schedule_date: { $exists: false } },
          u: { $set: { schedule_date: null } },
          multi: true,
        },
      ],
    });

    const scheduleDateModified = Number(scheduleDateResult.nModified) || 0;
    const scheduleDateMatched = Number(scheduleDateResult.nMatched) || 0;

    console.log(`   📋 Documents matched (missing schedule_date): ${scheduleDateMatched}`);
    console.log(`   ✅ Documents updated with schedule_date: ${scheduleDateModified}`);

    // Verify schedule_date update
    const remainingWithoutScheduleDate = await prisma.$runCommandRaw({
      count: 'jobs',
      query: { schedule_date: { $exists: false } },
    });

    const remainingScheduleDateCount = Number(remainingWithoutScheduleDate.n) || 0;
    if (remainingScheduleDateCount > 0) {
      console.warn(
        `   ⚠️  Warning: ${remainingScheduleDateCount} job(s) still missing schedule_date field`,
      );
    } else {
      console.log('   ✅ Verification: All jobs now have schedule_date field');
    }

    // Overall summary
    console.log('\n📊 Migration Summary:');
    console.log(`📋 Total documents updated with recurring_id: ${recurringIdModified}`);
    console.log(`📋 Total documents updated with schedule_date: ${scheduleDateModified}`);
    console.log(
      `⚠️  Total documents still missing fields: ${remainingRecurringIdCount + remainingScheduleDateCount}`,
    );

    if (recurringIdModified === 0 && scheduleDateModified === 0) {
      console.log(
        '\nℹ️  No documents needed updating. All jobs already have recurring_id and schedule_date fields.',
      );
    } else {
      console.log(
        `\n🎉 Successfully added fields to ${Math.max(recurringIdModified, scheduleDateModified)} job document(s)`,
      );
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    console.log('\n🔌 Disconnecting from database...');
    await prisma.$disconnect();
    console.log('✅ Database disconnected successfully');
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  addJobRecurringFields()
    .then(() => {
      console.log('🎉 Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

export { addJobRecurringFields };

