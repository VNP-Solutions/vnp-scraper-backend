# Add Job Recurring Fields Migration

This migration adds `recurring_id` and `schedule_date` fields to the `jobs` collection in MongoDB.

## What this migration does:

1. **Adds recurring_id field** to all existing jobs (set to `null` initially)
2. **Adds schedule_date field** to all existing jobs (set to `null` initially)
3. **Verifies the migration** to ensure all jobs have been updated
4. **Provides detailed logging** of the migration process

## Fields Added:

### `recurring_id`
- **Type**: String (ObjectId) or null
- **Purpose**: Links a job to a RecurringJob for grouping related scheduled jobs
- **Default**: `null` for existing jobs

### `schedule_date`
- **Type**: String or null
- **Purpose**: Stores the scheduled date for job execution
- **Default**: `null` for existing jobs

## How to run:

### Option 1: Run the migration script directly

```bash
npx ts-node migrations/add-job-recurring-fields.ts
```

### Option 2: Use the helper script

```bash
npx ts-node scripts/add-job-recurring-fields.ts
```

### Option 3: Add to package.json scripts (recommended)

Add this to your `package.json` scripts section:

```json
{
  "scripts": {
    "migrate:job-recurring": "ts-node migrations/add-job-recurring-fields.ts"
  }
}
```

Then run:

```bash
npm run migrate:job-recurring
```

## Safety Features:

- ✅ **Non-destructive**: Only adds new fields, doesn't modify existing data
- ✅ **Idempotent**: Can be run multiple times safely
- ✅ **Handles existing fields**: Skips jobs that already have the fields
- ✅ **MongoDB compatibility**: Uses MongoDB's native update operations
- ✅ **Detailed logging**: Shows progress and results
- ✅ **Verification**: Confirms all documents were updated correctly
- ✅ **Error handling**: Provides clear error messages if something fails

## Before running:

1. **Set up environment variables**: Ensure your `.env` file has:
   - `DATABASE_URL` - Your MongoDB connection string
2. **Generate Prisma Client**: Run `npx prisma generate --schema=./prisma/schema.prisma`
3. **Backup your database** (recommended for production)
4. **Test on staging environment** first
5. **Ensure database is running and accessible**

## Expected Output:

```
🚀 Starting migration to add recurring_id and schedule_date fields to jobs...

📡 Connecting to database...
✅ Database connected successfully

🔍 Processing jobs collection...

📋 Step 1: Adding recurring_id field...
   📋 Documents matched (missing recurring_id): 150
   ✅ Documents updated with recurring_id: 150
   ✅ Verification: All jobs now have recurring_id field

📋 Step 2: Adding schedule_date field...
   📋 Documents matched (missing schedule_date): 50
   ✅ Documents updated with schedule_date: 50
   ✅ Verification: All jobs now have schedule_date field

📊 Migration Summary:
📋 Total documents updated with recurring_id: 150
📋 Total documents updated with schedule_date: 50
⚠️  Total documents still missing fields: 0

🎉 Successfully added fields to 150 job document(s)

🔌 Disconnecting from database...
✅ Database disconnected successfully
🎉 Migration completed successfully!
```

## After Migration:

1. **Verify in your database** that jobs now have the new fields
2. **Update your application code** to use the new fields as needed
3. **Create RecurringJob records** as needed for job scheduling
4. **Link jobs to recurring jobs** by setting the `recurring_id` field

## Related Schema Changes:

This migration corresponds to the following Prisma schema updates:

### Job Model:
```prisma
model Job {
  // ... other fields
  recurring_id  String?     @db.ObjectId
  schedule_date String?
  // ... other fields
  
  recurringJob  RecurringJob?  @relation(fields: [recurring_id], references: [id])
}
```

### RecurringJob Model (New):
```prisma
model RecurringJob {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  jobs Job[]

  @@map("recurring_jobs")
}
```

## Troubleshooting:

### Connection Issues
- Verify `DATABASE_URL` is correct in `.env`
- Ensure MongoDB is running and accessible
- Check network connectivity and firewall settings

### Permission Issues
- Ensure database user has write permissions
- Verify authentication credentials

### Already Migrated
- If you see "No documents needed updating", the migration was already run
- This is safe and expected on subsequent runs

## Rollback:

If you need to remove these fields (not recommended):

```javascript
// ⚠️ Use with caution - this removes the fields
db.jobs.updateMany(
  {},
  { $unset: { recurring_id: "", schedule_date: "" } }
)
```
