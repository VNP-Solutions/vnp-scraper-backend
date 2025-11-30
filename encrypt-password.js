const crypto = require('crypto');
require('dotenv').config();

/**
 * Standalone script to encrypt passwords
 * Usage: node encrypt-password.js "YourPasswordHere"
 */

const algorithm = 'aes-256-gcm';

// Get encryption key from environment
const secretKey = process.env.ENCRYPTION_KEY;

if (!secretKey) {
  console.error('❌ Error: ENCRYPTION_KEY environment variable is not set!');
  console.error('Please set it in your .env file');
  process.exit(1);
}

if (secretKey.length !== 32) {
  console.error('❌ Error: ENCRYPTION_KEY must be exactly 32 characters long!');
  process.exit(1);
}

/**
 * Encrypts a plaintext string using AES-256-GCM
 */
function encrypt(text) {
  try {
    // Generate a random initialization vector
    const iv = crypto.randomBytes(16);

    // Create cipher with IV
    const cipher = crypto.createCipheriv(
      algorithm,
      Buffer.from(secretKey),
      iv,
    );

    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get the authentication tag (for GCM mode)
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Encrypts a password and returns it as a JSON string
 */
function encryptPassword(password) {
  const encryptedData = encrypt(password);
  return JSON.stringify(encryptedData);
}

// Main execution
const rawPassword = process.argv[2];

if (!rawPassword) {
  console.error('❌ Error: Please provide a password to encrypt!');
  console.error('Usage: node encrypt-password.js "YourPasswordHere"');
  process.exit(1);
}

try {
  console.log('\n🔐 Encrypting password...\n');
  console.log('Raw Password:', rawPassword);
  
  const encryptedPassword = encryptPassword(rawPassword);
  
  console.log('\n✅ Encryption successful!\n');
  console.log('Encrypted Password:');
  console.log(encryptedPassword);
  console.log('\n📋 You can now use this encrypted password in your database.\n');
} catch (error) {
  console.error('❌ Error encrypting password:', error.message);
  process.exit(1);
}


