#!/usr/bin/env ts-node

import { encryptExistingPasswords } from '../migrations/encrypt-existing-passwords';

console.log('🔐 Password Encryption Script');
console.log('=============================');
console.log(
  'This will encrypt all plain text passwords in PropertyCredentials',
);
console.log('using your existing EncryptionUtil (AES-256-GCM).\n');

encryptExistingPasswords();
