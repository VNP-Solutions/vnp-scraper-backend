# Property Credentials Migration

This migration moves `user_email` and `user_password` fields from the `Property` model to the `PropertyCredentials` model as `expediaUsername` and `expediaPassword`.

## What this migration does:

1. **Finds all Property records** that still have `user_email` and `user_password` data
2. **Creates or updates PropertyCredentials** records with the migrated data:
   - `user_email` → `expediaUsername`
   - `user_password` → `expediaPassword` (encrypted for security)
3. **Encrypts passwords** using your existing EncryptionUtil before storing them
4. **Handles already encrypted passwords** to avoid double encryption
5. **Removes the old fields** from Property documents to clean up the database

## How to run:

### Option 1: Run the migration script directly

```bash
npx ts-node migrations/migrate-property-credentials.ts
```

### Option 2: Use the helper script

```bash
npx ts-node scripts/migrate-credentials.ts
```

### Option 3: Add to package.json scripts (recommended)

Add this to your `package.json` scripts section:

```json
{
  "scripts": {
    "migrate:credentials": "ts-node migrations/migrate-property-credentials.ts"
  }
}
```

Then run:

```bash
npm run migrate:credentials
```

## Safety Features:

- ✅ **Non-destructive**: Creates PropertyCredentials records first, then removes old fields
- ✅ **Handles existing credentials**: Updates existing PropertyCredentials if they already exist
- ✅ **Password encryption**: Encrypts passwords using AES-256-GCM encryption
- ✅ **Smart encryption**: Detects already encrypted passwords to avoid double encryption
- ✅ **MongoDB compatibility**: Properly handles MongoDB ObjectId structures
- ✅ **Debug logging**: Shows property structure and ID extraction for troubleshooting
- ✅ **Detailed logging**: Shows progress and results for each property
- ✅ **Error handling**: Continues processing other properties if one fails
- ✅ **Summary report**: Shows final migration statistics

## ⚠️ Important Security Notes:

- **Encryption Key**: The `ENCRYPTION_KEY` must be exactly 32 characters long
- **Key Storage**: Keep your encryption key secure and backed up - losing it means losing access to encrypted passwords
- **Environment**: Use the same encryption key across all environments that share the same database

## Before running:

1. **Set up environment variables**: Ensure your `.env` file has:
   - `DATABASE_URL` - Your database connection string
   - `ENCRYPTION_KEY` - A 32-character encryption key for password encryption
2. **Backup your database** (recommended for production)
3. **Test on staging environment** first
4. **Ensure you have proper database permissions**
5. **Make sure your database is running and accessible**

## Expected Output:

```
🚀 Starting property credentials migration...
📡 Connecting to database...
✅ Database connected successfully
📋 Found 15 properties with old credentials
🔍 Debug - First property structure: { "_id": "507f1f77bcf86cd799439011", "user_email": "test@example.com", "user_password": "plaintext123" }
🔍 Processing property with ID: 507f1f77bcf86cd799439011 (type: string)
   🔐 Encrypting plain text password
✅ Created new credentials for property 507f1f77bcf86cd799439011
🔍 Processing property with ID: 507f1f77bcf86cd799439012 (type: string)
   🔒 Password already encrypted, skipping encryption
✅ Updated credentials for property 507f1f77bcf86cd799439012
...

📊 Migration Summary:
✅ Successfully migrated: 15 properties
⏭️  Skipped: 0 properties
📋 Total processed: 15 properties

🔌 Disconnecting from database...
✅ Database disconnected successfully
🎉 Migration completed successfully!
```

## 🔐 Post-Migration: Password Encryption

If you already ran the migration and have unencrypted passwords in PropertyCredentials, run the password encryption script:

```bash
npx ts-node migrations/encrypt-existing-passwords.ts
```

See `migrations/ENCRYPT-PASSWORDS-README.md` for detailed instructions on encrypting existing passwords.
