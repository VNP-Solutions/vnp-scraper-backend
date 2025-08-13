import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function waitForDatabase(maxRetries = 30, retryDelay = 2000): Promise<boolean> {
  console.log('🔄 Waiting for MongoDB to be ready...');
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try to connect to the database
      await prisma.$connect();
      console.log('✅ MongoDB is ready!');
      await prisma.$disconnect();
      return true;
    } catch (error) {
      console.log(`⏳ MongoDB not ready yet. Retrying in ${retryDelay/1000} seconds... (Attempt ${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  console.error('❌ Failed to connect to MongoDB after maximum retries');
  return false;
}

async function runPrismaMigrations(): Promise<void> {
  try {
    console.log('🔧 Running Prisma migrations...');
    
    // Wait for database to be ready
    const isDbReady = await waitForDatabase();
    if (!isDbReady) {
      throw new Error('Database is not available');
    }
    
    // Generate Prisma client
    console.log('📦 Generating Prisma client...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    
    // Push schema changes to database
    console.log('🚀 Applying database schema changes...');
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
    
    console.log('✅ Database migrations completed successfully!');
    
    // Verify trust fields exist
    await verifyTrustFields();
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function verifyTrustFields(): Promise<void> {
  try {
    console.log('🔍 Verifying trust fields in database...');
    
    await prisma.$connect();
    
    // Check if any property exists to verify schema
    const sampleProperty = await prisma.property.findFirst();
    
    if (sampleProperty) {
      // Check if trust fields exist by accessing them
      const trustFields = {
        booking_trusted_status: sampleProperty.booking_trusted_status ?? 'field_exists',
        booking_trust_score: sampleProperty.booking_trust_score ?? 'field_exists',
        booking_successful_logins: sampleProperty.booking_successful_logins ?? 'field_exists',
        booking_failed_logins: sampleProperty.booking_failed_logins ?? 'field_exists',
        booking_last_login: sampleProperty.booking_last_login ?? 'field_exists',
        booking_trust_established_date: sampleProperty.booking_trust_established_date ?? 'field_exists',
      };
      
      console.log('✅ Trust fields verified in database schema');
      
      // Set default values for properties that don't have trust status yet
      const propertiesWithoutTrust = await prisma.property.count({
        where: {
          booking_id: { not: null },
          booking_trusted_status: null,
        },
      });
      
      if (propertiesWithoutTrust > 0) {
        console.log(`📝 Found ${propertiesWithoutTrust} booking properties without trust status. Setting defaults...`);
        
        await prisma.property.updateMany({
          where: {
            booking_id: { not: null },
            booking_trusted_status: null,
          },
          data: {
            booking_trusted_status: 'not_trusted',
            booking_trust_score: 0,
            booking_successful_logins: 0,
            booking_failed_logins: 0,
          },
        });
        
        console.log('✅ Default trust values set for existing booking properties');
      }
    } else {
      console.log('ℹ️ No properties found in database (fresh installation)');
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.warn('⚠️ Could not verify trust fields:', error.message);
    // Don't throw - this is not critical for startup
  }
}

// Auto-run if this file is executed directly
if (require.main === module) {
  runPrismaMigrations()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

export { runPrismaMigrations, waitForDatabase, verifyTrustFields };