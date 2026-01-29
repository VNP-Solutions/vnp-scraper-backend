import { addJobRecurringFields } from '../migrations/add-job-recurring-fields';

/**
 * Helper script to run the job recurring fields migration
 * This adds recurring_id and schedule_date fields to all jobs
 */
async function runMigration() {
  console.log('🎯 Running Job Recurring Fields Migration...\n');
  await addJobRecurringFields();
}

runMigration()
  .then(() => {
    console.log('\n✅ Migration script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });
