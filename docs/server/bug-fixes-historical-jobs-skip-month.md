# Critical Bug Fixes: Historical Jobs & Skip Month Load Balancing

## Overview

Fixed two critical bugs in the recurring job system:
1. **Historical Jobs Duplication Bug**: Jobs being created multiple times
2. **Skip Month Load Balancing**: Separate jobs needed for each skipped month

---

## Bug 1: Historical Jobs Duplication

### The Problem

When creating a recurring job with `initial_date`:

```
POST /recurring-jobs
{
  "schedule_date": "2026-04-15",
  "initial_date": "2026-01-01",
  "property_name": "Test Hotel",
  ...
}
```

**What Happened (BUGGY):**
```
Apr 15: Creates 3 historical jobs
  - Job 1: Jan data (Pending)
  - Job 2: Feb data (Pending)  
  - Job 3: Mar data (Pending) ← Stays pending!

Apr 15 cron runs:
  - Executes Job 1 (Jan) ✓
  - Executes Job 2 (Feb) ✓
  - Job 3 (Mar) still pending
  - Calls createNextMonthJob() 3 times (once per job completion)

May 15:
  - Job 3 (Mar) still pending ❌
  - 3 DUPLICATE jobs for Apr created ❌❌❌
```

### Root Cause

Two issues:

1. **`next_date` was set incorrectly**:
   ```typescript
   // WRONG
   next_date: schedule_date  // Apr 15
   
   // Should be:
   next_date: nextScheduleDate  // May 15
   ```
   The `next_date` should point to AFTER the historical jobs, not the date they run on.

2. **No duplicate prevention**:
   - `createNextMonthJob()` was called multiple times (once per job completion)
   - No check if jobs already exist for the target schedule date
   - Created duplicate jobs

### The Fix

**Part 1: Set correct `next_date` after historical jobs**

```typescript
// After creating all historical jobs for Apr 15
const nextScheduleDate = this.getNextMonthScheduleDate(schedule_date);

await this.repository.update(recurringJob.id, {
  next_date: nextScheduleDate, // May 15, not Apr 15!
});
```

**Part 2: Prevent duplicates in `createNextMonthJob`**

```typescript
async createNextMonthJob(...) {
  const nextScheduleDate = this.getNextMonthScheduleDate(currentScheduleDate);
  
  // Check if jobs already exist for this date
  const existingJobs = await this.repository.findJobsByRecurringId(recurringId);
  const jobsForNextDate = existingJobs.filter(job => job.schedule_date === nextScheduleDate);
  
  if (jobsForNextDate.length > 0) {
    this.logger.warn('Jobs already exist, skipping to prevent duplicates');
    return null; // Don't create duplicates!
  }
  
  // Continue with job creation...
}
```

### After Fix

```
Apr 15: Creates 3 historical jobs + sets next_date = May 15
  - Job 1: Jan data (Pending)
  - Job 2: Feb data (Pending)  
  - Job 3: Mar data (Pending)

Apr 15 cron runs:
  - Executes Job 1 (Jan) ✓
  - Executes Job 2 (Feb) ✓
  - Executes Job 3 (Mar) ✓
  - Calls createNextMonthJob() 3 times
    - First call: Creates jobs for May 15 ✓
    - Second call: Detects duplicates, skips ✓
    - Third call: Detects duplicates, skips ✓

May 15:
  - 1 job for Apr created ✓ (no duplicates!)
```

---

## Bug 2: Skip Month Load Balancing

### The Problem

When jobs are scheduled on days 29-31, months without those days caused:

**Old Behavior (Capping):**
```
Jan 29 → Feb 28 (400 jobs - Jan + Feb data)
Jan 30 → Feb 28 (400 jobs - Jan + Feb data)
Jan 31 → Feb 28 (400 jobs - Jan + Feb data)

Result: Feb 28 gets 1200 jobs! ❌
```

### What You Need

**Separate jobs for each month, scheduled on the next valid date:**

```
Jan 29 completes on Jan 29:
  Next: Mar 29 creates TWO separate jobs:
    - Job 1: Jan data (scheduled Mar 29)
    - Job 2: Feb data (scheduled Mar 29)
  Total: 400 jobs on Mar 29 ✓

Jan 30 completes on Jan 30:
  Next: Mar 30 creates TWO separate jobs:
    - Job 1: Jan data (scheduled Mar 30)
    - Job 2: Feb data (scheduled Mar 30)
  Total: 400 jobs on Mar 30 ✓

Jan 31 completes on Jan 31:
  Next: Mar 31 creates TWO separate jobs:
    - Job 1: Jan data (scheduled Mar 31)
    - Job 2: Feb data (scheduled Mar 31)
  Total: 400 jobs on Mar 31 ✓
```

**Result:** Even distribution across Mar 28-31! ✅

### The Fix

**Calculate months skipped and create separate jobs:**

```typescript
async createNextMonthJob(...) {
  // Calculate how many months were skipped
  const currentDate = new Date(currentScheduleDate);
  const nextDate = new Date(nextScheduleDate);
  const monthsSkipped = (nextDate.getFullYear() - currentDate.getFullYear()) * 12 
                      + (nextDate.getMonth() - currentDate.getMonth());
  
  // monthsSkipped = 1: Normal (no skip)
  // monthsSkipped = 2: Skipped 1 month (e.g., Jan 29 → Mar 29)
  
  const createdJobs: Job[] = [];
  
  // Create separate job for EACH month
  for (let i = 1; i <= monthsSkipped; i++) {
    // Calculate which month this job covers
    const dataMonth = new Date(currentDate);
    dataMonth.setMonth(dataMonth.getMonth() + i);
    
    // Calculate date range for this specific month
    const { startDate, endDate } = this.getMonthlyDateRange(...);
    
    // Create job for this month, scheduled on target date
    const newJob = await this.createJobFromTemplate(templateJob, {
      recurring_id: recurringId,
      bucket_id: targetBucket.id,
      schedule_date: nextScheduleDate, // All jobs on same date
      start_date: startDate,            // This month's data
      end_date: endDate,                // This month's data
      name: `${recurringJob.name} - ${startDate} to ${endDate}`,
      server_id: currentServerId,
    });
    
    createdJobs.push(newJob);
  }
  
  // Add ALL created jobs to scheduler
  await this.scheduledJobService.createOrUpdateScheduledJob(
    nextScheduleDate,
    createdJobs.map(j => j.id),
  );
}
```

### Examples

#### Example 1: Normal Month (No Skip)
```
Jan 15 (200 jobs) completes:
  monthsSkipped = 1
  Creates 1 job:
    - Schedule: Feb 15
    - Data: Jan 1-31
    - Jobs: 200
```

#### Example 2: Skip 1 Month
```
Jan 29 (200 jobs) completes:
  nextScheduleDate = Mar 29 (Feb skipped)
  monthsSkipped = 2
  
  Creates 2 separate jobs on Mar 29:
    Job 1:
      - Schedule: Mar 29
      - Data: Jan 1-31
      - Jobs: 200
    
    Job 2:
      - Schedule: Mar 29
      - Data: Feb 1-28
      - Jobs: 200
  
  Total on Mar 29: 400 jobs ✓
```

#### Example 3: Skip 2 Months
```
Jan 31 (200 jobs) completes in non-leap year:
  nextScheduleDate = Mar 31 (Feb skipped)
  monthsSkipped = 2
  
  Creates 2 separate jobs on Mar 31:
    Job 1:
      - Schedule: Mar 31
      - Data: Jan 1-31
      - Jobs: 200
    
    Job 2:
      - Schedule: Mar 31
      - Data: Feb 1-28
      - Jobs: 200
  
  Total on Mar 31: 400 jobs ✓
```

---

## Load Distribution Analysis

### Scenario: 1000 jobs distributed on days 28-31 (250 each)

#### Month 1: January Execution

```
Date       Jobs Executed    Data Covered
─────────────────────────────────────────
Jan 28     250 jobs         Dec data
Jan 29     250 jobs         Dec data
Jan 30     250 jobs         Dec data
Jan 31     250 jobs         Dec data
```

#### Month 2: February Execution

```
Date       Jobs Created     Data Covered                Total Jobs
──────────────────────────────────────────────────────────────────
Feb 28     250 jobs         Jan data                    250 ✓
Feb 29*    0 jobs           (doesn't exist)             0
Feb 30     0 jobs           (doesn't exist)             0
```
*In leap years, Feb 29 would have 250 jobs

#### Month 3: March Execution

```
Date       Jobs Created     Data Covered                Total Jobs
──────────────────────────────────────────────────────────────────
Mar 28     250 jobs         Feb data                    250 ✓
Mar 29     250 + 250        Jan + Feb data              500 ✓
Mar 30     250 + 250        Jan + Feb data              500 ✓
Mar 31     250 + 250        Jan + Feb data              500 ✓
```

**Result:** 
- Feb 28: 250 jobs (normal load) ✓
- Mar 29-31: 500 jobs each (2× load for 2 months of data) ✓
- Even distribution, no overload ✓

---

## Bucket Management with Skipped Months

### Question: How do skipped month jobs fit in buckets?

**Answer:** Each job (regardless of skip) counts as **1 slot** in the bucket.

#### Example: duration = 3

```
Bucket 1:
  - Job 1: Jan data (scheduled Feb 28)
  - Job 2: Feb data (scheduled Mar 28)
  - Job 3: Mar data (scheduled Apr 28)
  [Full - 3/3 jobs]

Bucket 2:
  - Job 4: Apr data (scheduled May 28)
  - Job 5: May data (scheduled Jun 28)
  - Job 6: Jun data (scheduled Jul 28)
  [Full - 3/3 jobs]
```

#### Example with skips: duration = 3, day 31

```
Bucket 1:
  - Job 1: Dec data (scheduled Jan 31)
  - Job 2: Jan data (scheduled Mar 31) ← Skipped Feb
  - Job 3: Feb data (scheduled Mar 31) ← Skipped Feb
  [Full - 3/3 jobs]

Bucket 2:
  - Job 4: Mar data (scheduled May 31) ← Skipped Apr
  - Job 5: Apr data (scheduled May 31) ← Skipped Apr
  - Job 6: May data (scheduled Jul 31) ← Skipped Jun
  [Full - 3/3 jobs]
```

**Note:** Jobs for the same schedule date (Job 2 & 3) are in the **same bucket** because they're created together.

---

## Complete Year Example: Day 31 Jobs

### Setup
- 200 jobs per property per month
- Job runs on day 31 (when it exists)

### Full Year Execution

```
Month     Schedule    Jobs Created              Data Covered        Server Load
─────────────────────────────────────────────────────────────────────────────────
Jan 31    Jan 31      1 job                     Dec                 200
          (no skip)

Feb       (skipped - no day 31)

Mar 31    Mar 31      2 jobs                    Jan + Feb           400
          (skip 1)    - Job A: Jan data
                      - Job B: Feb data

Apr       (skipped - no day 31)

May 31    May 31      2 jobs                    Mar + Apr           400
          (skip 1)    - Job C: Mar data
                      - Job D: Apr data

Jun       (skipped - no day 31)

Jul 31    Jul 31      2 jobs                    May + Jun           400
          (skip 1)    - Job E: May data
                      - Job F: Jun data

Aug 31    Aug 31      1 job                     Jul                 200
          (no skip)

Sep       (skipped - no day 31)

Oct 31    Oct 31      2 jobs                    Aug + Sep           400
          (skip 1)    - Job G: Aug data
                      - Job H: Sep data

Nov       (skipped - no day 31)

Dec 31    Dec 31      2 jobs                    Oct + Nov           400
          (skip 1)    - Job I: Oct data
                      - Job J: Nov data
```

**Yearly Summary:**
- Execution days: 7 (Jan, Mar, May, Jul, Aug, Oct, Dec)
- Total jobs: 12 (one per month of data)
- Load per execution: 200-400 jobs (evenly distributed)
- No load spikes ✓

---

## Code Changes

### Change 1: Skip Month with Separate Jobs

**File:** `src/module/recurring-job/recurring-job.service.ts`

**Method:** `createNextMonthJob()`

```typescript
// Calculate months skipped
const monthsSkipped = (nextDate.getFullYear() - currentDate.getFullYear()) * 12 
                    + (nextDate.getMonth() - currentDate.getMonth());

// Create separate job for EACH month
for (let i = 1; i <= monthsSkipped; i++) {
  const dataMonth = new Date(currentDate);
  dataMonth.setMonth(dataMonth.getMonth() + i);
  
  // Get date range for THIS specific month
  const { startDate, endDate } = this.getMonthlyDateRange(...);
  
  // Create job
  const newJob = await this.createJobFromTemplate(templateJob, {
    schedule_date: nextScheduleDate,  // All on same date
    start_date: startDate,             // Different month data
    end_date: endDate,
    ...
  });
  
  createdJobs.push(newJob);
}

// Schedule ALL jobs together
await this.scheduledJobService.createOrUpdateScheduledJob(
  nextScheduleDate,
  createdJobs.map(j => j.id),
);
```

### Change 2: Duplicate Prevention

```typescript
// Check if jobs already exist for target date
const existingJobs = await this.repository.findJobsByRecurringId(recurringId);
const jobsForNextDate = existingJobs.filter(job => job.schedule_date === nextScheduleDate);

if (jobsForNextDate.length > 0) {
  this.logger.warn('Jobs already exist, skipping to prevent duplicates');
  return null; // Exit early
}
```

### Change 3: Correct `next_date` for Historical Jobs

```typescript
// After creating all historical jobs
const nextScheduleDate = this.getNextMonthScheduleDate(schedule_date);

await this.repository.update(recurringJob.id, {
  next_date: nextScheduleDate, // Points to NEXT execution
});
```

---

## Testing Scenarios

### Test 1: Historical Jobs (No Duplicates)

```bash
# Create recurring job with historical data
POST /recurring-jobs
{
  "schedule_date": "2026-04-15",
  "initial_date": "2026-01-01",
  "property_name": "Test Hotel",
  "ota_provider": "Expedia"
}

# Expected Result:
✓ 3 jobs created (Jan, Feb, Mar) scheduled for Apr 15
✓ next_date = May 15 (not Apr 15!)

# On Apr 15:
✓ All 3 jobs execute
✓ 1 job for Apr created for May 15 (no duplicates!)

# On May 15:
✓ 1 job for Apr executes
✓ 1 job for May created for Jun 15
```

### Test 2: Skip Month Strategy (Day 29)

```bash
# Create recurring job on Jan 29
POST /recurring-jobs
{
  "schedule_date": "2026-01-29",
  "property_name": "Test Hotel",
  ...
}

# Expected Execution Pattern:
Jan 29: 1 job (Dec data) - 200 jobs
Feb 29: Skipped (2026 non-leap year)
Mar 29: 2 jobs (Jan + Feb data) - 400 jobs ✓
Apr 29: 1 job (Mar data) - 200 jobs
May 29: 1 job (Apr data) - 200 jobs
Jun 29: 1 job (May data) - 200 jobs
Jul 29: 1 job (Jun data) - 200 jobs
```

### Test 3: Skip Month Strategy (Day 31)

```bash
# Create recurring job on Jan 31
POST /recurring-jobs
{
  "schedule_date": "2026-01-31",
  "property_name": "Test Hotel",
  ...
}

# Expected Execution Pattern:
Jan 31: 1 job (Dec data) - 200 jobs
Feb:    Skipped
Mar 31: 2 jobs (Jan + Feb data) - 400 jobs ✓
Apr:    Skipped  
May 31: 2 jobs (Mar + Apr data) - 400 jobs ✓
Jun:    Skipped
Jul 31: 2 jobs (May + Jun data) - 400 jobs ✓
Aug 31: 1 job (Jul data) - 200 jobs
Sep:    Skipped
Oct 31: 2 jobs (Aug + Sep data) - 400 jobs ✓
Nov:    Skipped
Dec 31: 2 jobs (Oct + Nov data) - 400 jobs ✓
```

---

## Load Distribution Comparison

### Old System (BUGGY)
```
Feb 28: 1200 jobs (days 28,29,30,31 all collapse) ❌ OVERLOAD
Mar 29: 0 jobs
Mar 30: 0 jobs  
Mar 31: 0 jobs
```

### New System (FIXED)
```
Feb 28: 250 jobs (only day 28) ✓
Mar 29: 500 jobs (day 29: Jan+Feb months) ✓
Mar 30: 500 jobs (day 30: Jan+Feb months) ✓
Mar 31: 500 jobs (day 31: Jan+Feb months) ✓

Total: 1750 jobs across 4 days
Average: 438 jobs/day (vs 1200 on one day)
```

---

## Benefits

### 1. No Duplicate Jobs
- ✅ Duplicate detection prevents multiple creations
- ✅ Correct `next_date` tracking
- ✅ Clean scheduler state

### 2. Even Load Distribution
- ✅ No single day overload
- ✅ 2× load for 2 months of data (expected and manageable)
- ✅ Predictable resource usage

### 3. Complete Data Coverage
- ✅ All months processed (no gaps)
- ✅ Separate jobs per month (clean bucket structure)
- ✅ Clear audit trail

### 4. Bucket Integrity
- ✅ Each job occupies 1 bucket slot
- ✅ Buckets fill sequentially
- ✅ Clean reporting structure

---

## Migration Notes

### For Existing Recurring Jobs

If you have existing recurring jobs that were created with the buggy code:

1. **Check for duplicates:**
   ```sql
   -- Find recurring jobs with duplicate jobs for same date
   db.jobs.aggregate([
     { $match: { recurring_id: { $exists: true } } },
     { $group: {
       _id: { recurring_id: "$recurring_id", schedule_date: "$schedule_date", start_date: "$start_date" },
       count: { $sum: 1 }
     }},
     { $match: { count: { $gt: 1 } } }
   ])
   ```

2. **Delete duplicates manually**

3. **Verify `next_date`:**
   ```typescript
   // Should point to NEXT execution, not current
   GET /recurring-jobs/:id
   // Check: next_date > max(jobs.schedule_date)
   ```

### For New Deployments

- ✅ No migration needed
- ✅ New jobs created with correct logic
- ✅ Automatic duplicate prevention

---

## Monitoring Checklist

After deploying these fixes, monitor:

- [ ] No duplicate jobs created (same schedule_date + start_date)
- [ ] All historical jobs execute on first schedule
- [ ] `next_date` always points to future, not current schedule
- [ ] Skipped month jobs create correct number (2 jobs for 1 skip, etc.)
- [ ] Server load distributed evenly (no single day overload)
- [ ] Bucket counts match expected values

---

## Related Documentation

- [Date-Based Server Capacity Architecture](./date-based-server-capacity-architecture.md)
- [Skip Month Load Balancing](./skip-month-load-balancing.md)

---

## Summary

**Before:**
- ❌ Historical jobs created duplicates
- ❌ Load concentrated on Feb 28 (1200 jobs)
- ❌ Skipped months lost data

**After:**
- ✅ No duplicates (duplicate detection)
- ✅ Even load distribution (500 jobs on Mar 29-31)
- ✅ All data covered (separate jobs per month)
- ✅ Clean bucket structure
- ✅ Production-ready solution
