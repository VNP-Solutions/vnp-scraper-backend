#!/usr/bin/env ts-node

import { migratePropertyCredentials } from '../migrations/migrate-property-credentials';

console.log('🔄 Property Credentials Migration Script');
console.log('========================================');
console.log(
  'This will migrate user_email and user_password from Property to PropertyCredentials',
);
console.log('as expediaUsername and expediaPassword respectively.\n');

migratePropertyCredentials();
