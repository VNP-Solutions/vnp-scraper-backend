import * as crypto from 'crypto';

/**
 * Decrypts an encrypted password from property credentials
 * Uses the same AES-256-GCM decryption method as the application
 *
 * Usage:
 * 1. Paste your 32-character ENCRYPTION_KEY below
 * 2. Paste your encrypted password JSON below
 * 3. Run: npm run decrypt-password
 *
 * That's it! The decrypted password will be displayed in the console.
 */

// ============================================
// CONFIGURATION - PASTE YOUR VALUES HERE
// ============================================

// Paste your 32-character encryption key here
const ENCRYPTION_KEY = 'vnp_is_nice_good_fantastic_s5c2g';

// Paste your encrypted password JSON here
// Format: {"encrypted":"...","iv":"...","authTag":"..."}
const ENCRYPTED_PASSWORD =
  '{"encrypted":"db323b5b97b45c8b6a1fa198","iv":"89cc538e3060257780ba784a88c5a2c3","authTag":"549b5434ff5671e38bf34349b4d8d6c5"}';

// ============================================
// END CONFIGURATION
// ============================================

const algorithm = 'aes-256-gcm';

function decryptPassword(
  encryptedPasswordJson: string,
  secretKey: string,
): string {
  try {
    if (!secretKey || secretKey === 'YOUR_32_CHARACTER_ENCRYPTION_KEY') {
      throw new Error(
        'Please set ENCRYPTION_KEY in the script (must be 32 characters)',
      );
    }

    if (secretKey.length !== 32) {
      throw new Error(
        'ENCRYPTION_KEY must be exactly 32 characters long for AES-256',
      );
    }

    // Parse the encrypted data JSON
    const encryptedData = JSON.parse(encryptedPasswordJson);
    const { encrypted, iv, authTag } = encryptedData;

    if (!encrypted || !iv || !authTag) {
      throw new Error(
        'Invalid encrypted data format. Must contain encrypted, iv, and authTag fields.',
      );
    }

    // Create decipher with IV
    const decipher = crypto.createDecipheriv(
      algorithm,
      Buffer.from(secretKey),
      Buffer.from(iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    // Decrypt the password
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

// Main execution
function main() {
  console.log('\n🔐 Decrypting password...\n');

  // Validate that values have been set
  if (!ENCRYPTED_PASSWORD) {
    console.error('❌ Error: ENCRYPTED_PASSWORD not set\n');
    console.log('Please edit the script and set ENCRYPTED_PASSWORD');
    console.log('Example:');
    console.log(
      'const ENCRYPTED_PASSWORD = \'{"encrypted":"abc123...","iv":"def456...","authTag":"ghi789..."}\';\n',
    );
    process.exit(1);
  }

  console.log('Encryption Key Length:', ENCRYPTION_KEY.length, 'characters');
  console.log('Encrypted data:', ENCRYPTED_PASSWORD);
  console.log('');

  try {
    const decryptedPassword = decryptPassword(
      ENCRYPTED_PASSWORD,
      ENCRYPTION_KEY,
    );

    console.log('✅ Decryption successful!\n');
    console.log('═══════════════════════════════════════');
    console.log('Decrypted Password:', decryptedPassword);
    console.log('═══════════════════════════════════════\n');
  } catch (error) {
    console.error('❌ Decryption failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check that ENCRYPTION_KEY is exactly 32 characters');
    console.error('2. Verify the encrypted data format is correct');
    console.error(
      '3. Ensure the encrypted data was encrypted with the same key\n',
    );
    process.exit(1);
  }
}

main();
