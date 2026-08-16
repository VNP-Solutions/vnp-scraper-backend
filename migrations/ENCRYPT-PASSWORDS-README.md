# Password Encryption for PropertyCredentials

This script encrypts all plain text passwords in existing PropertyCredentials records.

## 🎯 Purpose

After migrating credentials from Property to PropertyCredentials, some passwords might still be in plain text. This script will:

1. **Find all PropertyCredentials** with passwords (expediaPassword, agodaPassword, bookingPassword)
2. **Detect which passwords are plain text** vs already encrypted
3. **Encrypt plain text passwords** using your existing EncryptionUtil
4. **Update the database** with encrypted passwords
5. **Leave already encrypted passwords** unchanged

## 🚀 How to run:

### Option 1: Run the script directly

```bash
npx ts-node migrations/encrypt-existing-passwords.ts
```

### Option 2: Use the helper script

```bash
npx ts-node scripts/encrypt-passwords.ts
```

### Option 3: Add to package.json scripts (recommended)

Add this to your `package.json` scripts section:

```json
{
  "scripts": {
    "encrypt:passwords": "ts-node migrations/encrypt-existing-passwords.ts"
  }
}
```

Then run:

```bash
npm run encrypt:passwords
```

## ⚙️ What it processes:

- ✅ **expediaPassword** - Encrypts if plain text
- ✅ **agodaPassword** - Encrypts if plain text
- ✅ **bookingPassword** - Encrypts if plain text
- ✅ **Smart detection** - Skips already encrypted passwords
- ✅ **Safe operation** - Only updates what needs encryption

## 🛡️ Safety Features:

- ✅ **Non-destructive**: Only encrypts plain text passwords
- ✅ **Smart detection**: Automatically detects encrypted vs plain text
- ✅ **Detailed logging**: Shows what's being processed for each record
- ✅ **Error handling**: Continues processing other records if one fails
- ✅ **Summary report**: Shows final encryption statistics

## ⚠️ Requirements:

1. **Environment variables**: Ensure your `.env` file has:

   - `DATABASE_URL` - Your database connection string
   - `ENCRYPTION_KEY` - A 32-character encryption key for password encryption

2. **Database access**: Make sure your database is running and accessible

3. **Backup recommended**: Backup your database before running (recommended for production)

## 📋 Expected Output:

```
🚀 Starting password encryption for PropertyCredentials...
📡 Connecting to database...
✅ Database connected successfully
📋 Found 25 credential records to process
🔍 Processing PropertyCredentials ID: 507f1f77bcf86cd799439011
   🔐 Encrypting Expedia password
   🔒 Agoda password already encrypted
✅ Updated encrypted passwords for credential 507f1f77bcf86cd799439011
🔍 Processing PropertyCredentials ID: 507f1f77bcf86cd799439012
   🔒 Expedia password already encrypted
   🔐 Encrypting Booking password
✅ Updated encrypted passwords for credential 507f1f77bcf86cd799439012
...

📊 Encryption Summary:
🔐 Newly encrypted passwords: 15 records
🔒 Already encrypted passwords: 28 passwords
⏭️  Skipped: 5 records
📋 Total processed: 25 records

🔌 Disconnecting from database...
✅ Database disconnected successfully
🎉 Password encryption completed successfully!
```

## 🔄 After running this script:

- ✅ All passwords in PropertyCredentials will be encrypted
- ✅ Your application's decrypt functions will work properly
- ✅ No more decryption errors when accessing credentials
- ✅ Consistent encryption across all password fields

## 🚨 Important Notes:

- **Run this AFTER** the main property credentials migration
- **Use the same ENCRYPTION_KEY** as your application
- **Test on staging** environment first
- **Keep encryption key secure** - losing it means losing access to passwords
