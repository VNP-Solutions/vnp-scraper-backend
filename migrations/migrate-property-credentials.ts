import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { EncryptionUtil } from '../src/common/utils/encryption.util';

const prisma = new PrismaClient();

// Initialize encryption utility
const configService = new ConfigService();
const encryptionUtil = new EncryptionUtil(configService);

interface OldPropertyData {
  _id: { $oid: string } | string;
  user_email?: string;
  user_password?: string;
}

/**
 * Check if a password is already encrypted by trying to decrypt it
 * @param password - The password to check
 * @returns true if already encrypted, false if plain text
 */
function isPasswordEncrypted(password: string): boolean {
  if (!password) return false;

  try {
    // Try to decrypt the password - if successful, it's already encrypted
    encryptionUtil.decryptPassword(password);
    return true;
  } catch {
    // If decryption fails, it's likely plain text
    return false;
  }
}

/**
 * Safely encrypt a password, checking if it's already encrypted
 * @param password - The password to encrypt
 * @returns Encrypted password or original if already encrypted
 */
function safeEncryptPassword(password: string): string {
  if (!password) return password;

  if (isPasswordEncrypted(password)) {
    console.log('   🔒 Password already encrypted, skipping encryption');
    return password;
  }

  console.log('   🔐 Encrypting plain text password');
  return encryptionUtil.encryptPassword(password);
}

async function migratePropertyCredentials() {
  console.log('🚀 Starting property credentials migration...');

  try {
    // Connect to database
    console.log('📡 Connecting to database...');
    try {
      await prisma.$connect();
      console.log('✅ Database connected successfully');
    } catch (connectionError) {
      console.error('❌ Failed to connect to database:', connectionError);
      throw new Error(
        'Database connection failed. Please check your DATABASE_URL and database status.',
      );
    }
    // Get all properties that might have old user_email and user_password data
    // Since the fields are removed from schema, we'll use raw query
    const properties = (await prisma.$runCommandRaw({
      find: 'properties',
      filter: {
        $or: [
          {
            user_email: {
              $exists: true,
              $nin: [null, ''],
            },
          },
          {
            user_password: {
              $exists: true,
              $nin: [null, ''],
            },
          },
        ],
      },
    })) as any;

    if (!properties.cursor || !properties.cursor.firstBatch) {
      console.log('ℹ️  No properties with old credentials found.');
      return;
    }

    const propertyData = properties.cursor.firstBatch as OldPropertyData[];
    console.log(
      `📋 Found ${propertyData.length} properties with old credentials`,
    );

    // Debug: Log first property structure
    if (propertyData.length > 0) {
      console.log(
        '🔍 Debug - First property structure:',
        JSON.stringify(propertyData[0], null, 2),
      );
    }

    let migratedCount = 0;
    let skippedCount = 0;

    for (const property of propertyData) {
      try {
        // Extract the actual ID from MongoDB ObjectId structure
        const id =
          typeof property._id === 'object' ? property._id.$oid : property._id;
        const { user_email, user_password } = property;

        console.log(
          `🔍 Processing property with ID: ${id} (type: ${typeof property._id})`,
        );

        // Skip if no credentials to migrate or no valid ID
        if (!id) {
          console.log(`⏭️  Skipping property with missing ID`);
          skippedCount++;
          continue;
        }

        if (!user_email && !user_password) {
          console.log(`⏭️  Skipping property ${id} - no credentials found`);
          skippedCount++;
          continue;
        }

        // Check if PropertyCredentials already exists for this property
        const existingCredentials = await prisma.propertyCredentials.findFirst({
          where: { property_id: id },
        });

        if (existingCredentials) {
          // Update existing credentials
          const updateData: any = {};

          if (user_email) {
            updateData.expediaUsername = user_email;
          }

          if (user_password) {
            updateData.expediaPassword = safeEncryptPassword(user_password);
          }

          if (Object.keys(updateData).length > 0) {
            await prisma.propertyCredentials.update({
              where: { id: existingCredentials.id },
              data: updateData,
            });
            console.log(`✅ Updated credentials for property ${id}`);
          } else {
            console.log(`⏭️  No new credentials to update for property ${id}`);
          }
        } else {
          // Create new credentials record
          await prisma.propertyCredentials.create({
            data: {
              property_id: id,
              expediaUsername: user_email || null,
              expediaPassword: user_password
                ? safeEncryptPassword(user_password)
                : null,
            },
          });
          console.log(`✅ Created new credentials for property ${id}`);
        }

        // Remove old fields from property document using raw update
        await prisma.$runCommandRaw({
          update: 'properties',
          updates: [
            {
              q: {
                _id:
                  typeof property._id === 'object'
                    ? property._id
                    : { $oid: id },
              },
              u: {
                $unset: {
                  user_email: '',
                  user_password: '',
                },
              },
            },
          ],
        });

        migratedCount++;
      } catch (error) {
        const propertyId =
          typeof property._id === 'object' ? property._id.$oid : property._id;
        console.error(`❌ Error migrating property ${propertyId}:`, error);
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`✅ Successfully migrated: ${migratedCount} properties`);
    console.log(`⏭️  Skipped: ${skippedCount} properties`);
    console.log(`📋 Total processed: ${propertyData.length} properties`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    console.log('🔌 Disconnecting from database...');
    await prisma.$disconnect();
    console.log('✅ Database disconnected successfully');
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migratePropertyCredentials()
    .then(() => {
      console.log('🎉 Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

export { migratePropertyCredentials };
