import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Update a collection to add is_archived field with false value to documents that don't have it
 */
async function updateCollection(collectionName: string) {
  console.log(`\n🔍 Processing ${collectionName} collection...`);

  // Update documents without is_archived field
  const result = await prisma.$runCommandRaw({
    update: collectionName,
    updates: [
      {
        q: { is_archived: { $exists: false } },
        u: { $set: { is_archived: false } },
        multi: true,
      },
    ],
  });

  const modifiedCount = Number(result.nModified) || 0;
  const matchedCount = Number(result.nMatched) || 0;

  console.log(`   📋 Documents matched: ${matchedCount}`);
  console.log(`   ✅ Documents updated: ${modifiedCount}`);

  // Verify the update
  const remainingCount = await prisma.$runCommandRaw({
    count: collectionName,
    query: { is_archived: { $exists: false } },
  });

  const remainingWithoutField = Number(remainingCount.n) || 0;
  if (remainingWithoutField > 0) {
    console.warn(
      `   ⚠️  Warning: ${remainingWithoutField} document(s) still missing is_archived field`,
    );
  } else {
    console.log(
      `   ✅ Verification: All ${collectionName} documents now have is_archived field`,
    );
  }

  return { matchedCount, modifiedCount, remainingWithoutField };
}

/**
 * Add is_archived field with false value to jobs, retrievals, and parent_retrievals
 */
async function addIsArchivedField() {
  console.log('🚀 Starting migration to add is_archived field...');
  console.log('📦 Collections to update: jobs, retrievals, parent_retrievals');

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

    const collections = [
      { name: 'jobs', displayName: 'Jobs' },
      { name: 'retrievals', displayName: 'Retrievals' },
      { name: 'parent_retrievals', displayName: 'Parent Retrievals' },
    ];

    const summary = {
      totalMatched: 0,
      totalModified: 0,
      totalRemaining: 0,
    };

    // Process each collection
    for (const collection of collections) {
      const result = await updateCollection(collection.name);
      summary.totalMatched += result.matchedCount;
      summary.totalModified += result.modifiedCount;
      summary.totalRemaining += result.remainingWithoutField;
    }

    // Overall summary
    console.log(`\n📊 Overall Migration Summary:`);
    console.log(`📋 Total documents matched: ${summary.totalMatched}`);
    console.log(`✅ Total documents updated: ${summary.totalModified}`);
    console.log(
      `⚠️  Total documents still missing field: ${summary.totalRemaining}`,
    );

    if (summary.totalModified === 0) {
      console.log(
        '\nℹ️  No documents needed updating. All collections already have is_archived field.',
      );
    } else {
      console.log(
        `\n🎉 Successfully added is_archived: false to ${summary.totalModified} document(s) across all collections`,
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
  addIsArchivedField()
    .then(() => {
      console.log('🎉 Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

export { addIsArchivedField };
