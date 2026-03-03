import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

async function runMigration() {
  try {
    console.log('Running migration: add-recurring-job-portfolio-property...\n');

    const { stdout, stderr } = await execPromise(
      'npx ts-node migrations/add-recurring-job-portfolio-property.ts',
    );

    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);

    console.log('\n✅ Migration completed successfully!');
  } catch (error: any) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    process.exit(1);
  }
}

runMigration();
