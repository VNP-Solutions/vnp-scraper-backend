# Recurring Job Initial Date Feature

## Overview
Added support for creating historical jobs when creating a recurring job. When an `initial_date` is provided, the system will automatically create jobs for all months from the `initial_date` to the `schedule_date`.

## Feature Details

### New Field: `initial_date`
- **Type**: String (YYYY-MM-DD format)
- **Required**: No (optional)
- **Available in**: 
  - `POST /recurring-jobs` (CreateRecurringJobDto)
  - `POST /recurring-jobs/from-job` (CreateRecurringJobFromJobDto)

### Behavior

#### Without `initial_date` (Normal Flow)
When `initial_date` is not provided, the system works as before:
1. Creates one bucket
2. Creates one job for the previous month relative to `schedule_date`
3. Schedules the job to run on `schedule_date`

**Example:**
```json
{
  "schedule_date": "2026-06-05",
  "property_name": "Hotel ABC",
  "ota_provider": "Expedia",
  ...
}
```
- Creates 1 job: May 2026 (2026-05-01 to 2026-05-31)
- Scheduled to run: June 5, 2026

#### With `initial_date` (Historical Jobs)
When `initial_date` is provided, the system creates jobs for all months between the `initial_date` and `schedule_date`:

**Example:**
```json
{
  "schedule_date": "2026-06-05",
  "initial_date": "2026-01-15",
  "property_name": "Hotel ABC",
  "ota_provider": "Expedia",
  "duration": 2,
  ...
}
```

**What happens:**
1. **Calculates historical months**: From the month BEFORE `initial_date` up to the month BEFORE `schedule_date`
   - December 2025, January 2026, February 2026, March 2026, April 2026, May 2026

2. **Creates buckets**: Based on `duration` setting
   - Bucket 1: December 2025 - January 2026 (2 jobs)
   - Bucket 2: February 2026 - March 2026 (2 jobs)
   - Bucket 3: April 2026 - May 2026 (2 jobs)

3. **Creates jobs**: 
   - Job 1: Dec 1-31, 2025 (data range) → scheduled for June 5, 2026
   - Job 2: Jan 1-31, 2026 (data range) → scheduled for June 5, 2026
   - Job 3: Feb 1-28, 2026 (data range) → scheduled for June 5, 2026
   - Job 4: Mar 1-31, 2026 (data range) → scheduled for June 5, 2026
   - Job 5: Apr 1-30, 2026 (data range) → scheduled for June 5, 2026
   - Job 6: May 1-31, 2026 (data range) → scheduled for June 5, 2026

4. **All jobs run on the same date**: June 5, 2026

5. **Next scheduled job**: After all jobs run on June 5, the system will create the next job for June 2026, scheduled to run on July 5, 2026 (based on the normal recurring workflow)

## API Examples

### Example 1: Create Recurring Job with Historical Data

**Request:**
```bash
POST /recurring-jobs
Content-Type: application/json

{
  "property_name": "DoubleTree South Charlotte",
  "ota_provider": "Expedia",
  "schedule_date": "2026-06-05",
  "initial_date": "2026-01-15",
  "duration": 2,
  "portfolio_id": "69637621df4ea6d03e06b0ea",
  "property_id": "69637734df4ea6d03e06b0f1",
  "posting_type": "Manual",
  "billing_type": "VCC",
  "next_due_date": "2026-07-01",
  "remaining_direct_billed": 0,
  "total_collectable": 1000,
  "total_amount_confirmed": 1000,
  "execution_type": "scheduled",
  "job_backoff_length_loading": 5000,
  "job_backoff_length_selector": 3000
}
```

**Response:**
```json
{
  "statusCode": 201,
  "message": "Recurring job created successfully",
  "data": {
    "recurringJob": {
      "id": "...",
      "name": "DoubleTree South Charlotte - Expedia",
      "schedule_date": "2026-06-05",
      "next_date": "2026-06-05",
      "duration": 2,
      "is_active": true
    },
    "bucket": {
      "id": "...",
      "bucket_number": 3,
      "name": "Reporting for Start Apr - End May 2026"
    },
    "job": {
      "id": "...",
      "name": "DoubleTree South Charlotte - Expedia - 2026-05-01 to 2026-05-31",
      "start_date": "2026-05-01",
      "end_date": "2026-05-31",
      "schedule_date": "2026-06-05"
    },
    "historicalJobs": [
      {
        "id": "...",
        "name": "DoubleTree South Charlotte - Expedia - 2025-12-01 to 2025-12-31",
        "start_date": "2025-12-01",
        "end_date": "2025-12-31",
        "schedule_date": "2026-06-05"
      },
      // ... 4 more historical jobs (Jan-May 2026)
    ]
  }
}
```

### Example 2: Create from Existing Job with Historical Data

**Request:**
```bash
POST /recurring-jobs/from-job
Content-Type: application/json

{
  "job_id": "65f8a9b1c2d3e4f5a6b7c8d9",
  "schedule_date": "2026-06-05",
  "initial_date": "2026-01-15",
  "duration": 1
}
```

**Response:** Similar structure to Example 1

## Use Cases

### Use Case 1: Backfilling Historical Data
A hotel just signed up and needs reports for the past 6 months, all to be processed on the same date.

**Solution:**
```json
{
  "schedule_date": "2026-06-05",
  "initial_date": "2026-01-01",
  ...
}
```
This creates 6 historical jobs (Dec 2025 - May 2026), all scheduled to run on June 5, 2026. After they run, the cron will create the June 2026 job to run on July 5, 2026.

### Use Case 2: Catch-up After Outage
System was down for 3 months, and you need to catch up on missed reports.

**Solution:**
```json
{
  "schedule_date": "2026-06-05",
  "initial_date": "2026-03-01",
  ...
}
```
Creates 4 jobs (Feb-May historical) to process the missed months, all scheduled to run on June 5, 2026. After they run, the cron will create June 2026 job for July 5, 2026.

## Implementation Details

### Helper Method: `getHistoricalMonths()`
Calculates the list of month-year strings from `initial_date` to `schedule_date`:

```typescript
private getHistoricalMonths(initial_date: string, schedule_date: string): string[] {
  const initialDate = new Date(initial_date);
  const scheduleDate = new Date(schedule_date);
  
  const months: string[] = [];
  
  // Start from the month before the initial_date month
  const currentDate = new Date(initialDate.getFullYear(), initialDate.getMonth() - 1, 1);
  
  // End at the month before schedule_date month
  const endDate = new Date(scheduleDate.getFullYear(), scheduleDate.getMonth() - 1, 1);
  
  while (currentDate <= endDate) {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
    
    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  
  return months;
}
```

### Bucket Creation Logic
- Historical jobs are distributed across buckets based on the `duration` field
- Each bucket can hold `duration` number of jobs
- When a bucket is full, a new bucket is created with an incremented `bucket_number`

### Job Naming Convention
All jobs follow the same naming pattern:
```
{property_name} - {ota_provider} - {start_date} to {end_date}
```

Example: `"DoubleTree South Charlotte - Expedia - 2026-01-01 to 2026-01-31"`

## Testing

### Test Scenario 1: Simple Historical Jobs
```json
{
  "schedule_date": "2026-03-15",
  "initial_date": "2026-01-05",
  "duration": 1
}
```

**Expected Result:**
- 3 jobs created:
  - Dec 2025 (2025-12-01 to 2025-12-31)
  - Jan 2026 (2026-01-01 to 2026-01-31)
  - Feb 2026 (2026-02-01 to 2026-02-28)
- All scheduled for: March 15, 2026
- 3 buckets created (one per job)
- After the cron runs on March 15, it will create the March 2026 job, scheduled to run on April 15, 2026

### Test Scenario 2: Multi-Month Duration
```json
{
  "schedule_date": "2026-03-15",
  "initial_date": "2026-01-05",
  "duration": 2
}
```

**Expected Result:**
- 3 jobs created (same as above)
- 2 buckets created:
  - Bucket 1: Dec 2025, Jan 2026
  - Bucket 2: Feb 2026
- After the cron runs on March 15, it will create the March 2026 job in Bucket 2, scheduled to run on April 15, 2026

## Notes

1. **All historical jobs run on the same schedule_date**: This allows batch processing of historical data
2. **Date ranges are based on month boundaries**: Each job covers a complete month (1st to last day)
3. **The current month job is NOT created**: When using `initial_date`, only historical jobs up to the month before `schedule_date` are created. The current month job will be created by the cron scheduler after the historical jobs run.
4. **Future recurring workflow continues normally**: After the historical jobs run, the system continues creating monthly jobs as per the normal recurring workflow
5. **Backward compatibility**: If `initial_date` is not provided, the system works exactly as before

## Related Files

- `src/module/recurring-job/recurring-job.dto.ts` - Added `initial_date` field
- `src/module/recurring-job/recurring-job.validation.ts` - Added validation for `initial_date`
- `src/module/recurring-job/recurring-job.service.ts` - Implemented historical job creation logic
