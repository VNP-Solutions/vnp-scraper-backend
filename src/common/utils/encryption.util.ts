import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionUtil {
  private readonly algorithm = 'aes-256-gcm';
  private readonly secretKey: string;

  constructor(private readonly configService: ConfigService) {
    // Get the encryption key from environment variables
    const envKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!envKey) {
      throw new Error(
        'ENCRYPTION_KEY environment variable is required. Please set a 32-character encryption key.',
      );
    }

    this.secretKey = envKey;

    // Ensure the key is exactly 32 bytes for AES-256
    if (this.secretKey.length !== 32) {
      throw new Error(
        'ENCRYPTION_KEY must be exactly 32 characters long for AES-256',
      );
    }
  }

  /**
   * Encrypts a plaintext string using AES-256-GCM
   * @param text - The plaintext to encrypt
   * @returns Object containing the encrypted data, IV, and auth tag
   */
  encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
    try {
      // Generate a random initialization vector
      const iv = crypto.randomBytes(16);

      // Create cipher with IV
      const cipher = crypto.createCipheriv(
        this.algorithm,
        Buffer.from(this.secretKey),
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
   * Decrypts an encrypted string using AES-256-GCM
   * @param encryptedData - Object containing encrypted data, IV, and auth tag
   * @returns The decrypted plaintext
   */
  decrypt(encryptedData: {
    encrypted: string;
    iv: string;
    authTag: string;
  }): string {
    try {
      const { encrypted, iv, authTag } = encryptedData;

      // Create decipher with IV
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        Buffer.from(this.secretKey),
        Buffer.from(iv, 'hex'),
      );
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));

      // Decrypt the text
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypts a password and returns it as a JSON string for storage
   * @param password - The plaintext password
   * @returns JSON string containing encrypted password data
   */
  encryptPassword(password: string): string {
    const encryptedData = this.encrypt(password);
    return JSON.stringify(encryptedData);
  }

  /**
   * Decrypts a password from its JSON string representation
   * @param encryptedPasswordJson - JSON string containing encrypted password data
   * @returns The decrypted password
   */
  decryptPassword(encryptedPasswordJson: string): string {
    try {
      const encryptedData = JSON.parse(encryptedPasswordJson);
      return this.decrypt(encryptedData);
    } catch (error) {
      throw new Error(`Failed to decrypt password: ${error.message}`);
    }
  }

  /**
   * Simple method to encrypt a string and return base64 encoded result
   * @param text - The plaintext to encrypt
   * @returns Base64 encoded encrypted string
   */
  simpleEncrypt(text: string): string {
    const encryptedData = this.encrypt(text);
    return Buffer.from(JSON.stringify(encryptedData)).toString('base64');
  }

  /**
   * Simple method to decrypt a base64 encoded encrypted string
   * @param encryptedBase64 - Base64 encoded encrypted string
   * @returns The decrypted plaintext
   */
  simpleDecrypt(encryptedBase64: string): string {
    try {
      const encryptedData = JSON.parse(
        Buffer.from(encryptedBase64, 'base64').toString(),
      );
      return this.decrypt(encryptedData);
    } catch (error) {
      throw new Error(`Failed to decrypt data: ${error.message}`);
    }
  }
}
