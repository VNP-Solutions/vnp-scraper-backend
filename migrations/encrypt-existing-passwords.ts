import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { EncryptionUtil } from '../src/common/utils/encryption.util';

const prisma = new PrismaClient();

// Initialize encryption utility
const configService = new ConfigService();
const encryptionUtil = new EncryptionUtil(configService);

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
    console.log('   🔒 Password already encrypted, skipping');
    return password;
  }

  console.log('   🔐 Encrypting plain text password');
  return encryptionUtil.encryptPassword(password);
}

async function encryptExistingPasswords() {
  console.log('🚀 Starting password encryption for PropertyCredentials...');

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

    // Get all PropertyCredentials that have passwords
    const credentials = await prisma.propertyCredentials.findMany({
      where: {
        OR: [
          { expediaPassword: { not: null } },
          { agodaPassword: { not: null } },
          { bookingPassword: { not: null } },
        ],
      },
    });

    if (!credentials || credentials.length === 0) {
      console.log('ℹ️  No PropertyCredentials with passwords found.');
      return;
    }

    console.log(`📋 Found ${credentials.length} credential records to process`);

    let encryptedCount = 0;
    let alreadyEncryptedCount = 0;
    let skippedCount = 0;

    for (const credential of credentials) {
      try {
        console.log(`🔍 Processing PropertyCredentials ID: ${credential.id}`);

        const updateData: any = {};
        let hasChanges = false;

        // Process Expedia password
        if (credential.expediaPassword) {
          if (!isPasswordEncrypted(credential.expediaPassword)) {
            console.log('   🔐 Encrypting Expedia password');
            updateData.expediaPassword = encryptionUtil.encryptPassword(
              credential.expediaPassword,
            );
            hasChanges = true;
          } else {
            console.log('   🔒 Expedia password already encrypted');
            alreadyEncryptedCount++;
          }
        }

        // Process Agoda password
        if (credential.agodaPassword) {
          if (!isPasswordEncrypted(credential.agodaPassword)) {
            console.log('   🔐 Encrypting Agoda password');
            updateData.agodaPassword = encryptionUtil.encryptPassword(
              credential.agodaPassword,
            );
            hasChanges = true;
          } else {
            console.log('   🔒 Agoda password already encrypted');
            alreadyEncryptedCount++;
          }
        }

        // Process Booking password
        if (credential.bookingPassword) {
          if (!isPasswordEncrypted(credential.bookingPassword)) {
            console.log('   🔐 Encrypting Booking password');
            updateData.bookingPassword = encryptionUtil.encryptPassword(
              credential.bookingPassword,
            );
            hasChanges = true;
          } else {
            console.log('   🔒 Booking password already encrypted');
            alreadyEncryptedCount++;
          }
        }

        // Update the record if there are changes
        if (hasChanges) {
          await prisma.propertyCredentials.update({
            where: { id: credential.id },
            data: updateData,
          });
          console.log(
            `✅ Updated encrypted passwords for credential ${credential.id}`,
          );
          encryptedCount++;
        } else {
          console.log(
            `⏭️  No plain text passwords found for credential ${credential.id}`,
          );
          skippedCount++;
        }
      } catch (error) {
        console.error(
          `❌ Error processing credential ${credential.id}:`,
          error,
        );
      }
    }

    console.log('\n📊 Encryption Summary:');
    console.log(`🔐 Newly encrypted passwords: ${encryptedCount} records`);
    console.log(
      `🔒 Already encrypted passwords: ${alreadyEncryptedCount} passwords`,
    );
    console.log(`⏭️  Skipped: ${skippedCount} records`);
    console.log(`📋 Total processed: ${credentials.length} records`);
  } catch (error) {
    console.error('❌ Encryption failed:', error);
    throw error;
  } finally {
    console.log('🔌 Disconnecting from database...');
    await prisma.$disconnect();
    console.log('✅ Database disconnected successfully');
  }
}

// Run encryption if this file is executed directly
if (require.main === module) {
  encryptExistingPasswords()
    .then(() => {
      console.log('🎉 Password encryption completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Password encryption failed:', error);
      process.exit(1);
    });
}

export { encryptExistingPasswords };
