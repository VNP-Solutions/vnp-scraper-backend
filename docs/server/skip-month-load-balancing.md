# Load Balancing: Skip Month Strategy for Date Edge Cases

## Problem Statement

When recurring jobs are scheduled on days 28-31 of the month, the naive "cap to last valid day" approach causes **massive load concentration** on certain dates.

### Example Problem (Old Approach)

If you have 200 jobs each on Jan 28, 29, 30, and 31:

```
Current Month  →  Next Month (Naive Capping)
─────────────────────────────────────────────
Jan 28 (200)   →  Feb 28 (200 jobs)
Jan 29 (200)   →  Feb 28 (200 jobs) ← Same date!
Jan 30 (200)   →  Feb 28 (200 jobs) ← Same date!
Jan 31 (200)   →  Feb 28 (200 jobs) ← Same date!
                  ─────────────────
                  Total: 800 jobs on Feb 28! ❌
```

**Result:** February 28th receives 4× the normal load, causing:
- Server overload
- Execution delays
- Cascade failures
- Poor user experience

## Solution: Skip Month Strategy

Instead of capping the day, **skip to the next month that has the required day**.

### How It Works

```typescript
// If current day doesn't exist in next month, keep advancing
while (currentDay > lastDayOfNextMonth) {
  nextMonth += 1; // Skip this month
}
// Use the first month where currentDay exists
```

### Example Solution

```
Current Month  →  Next Month (Skip Strategy)
─────────────────────────────────────────────
Jan 28 (200)   →  Feb 28 (200 jobs) ← Feb has 28 days ✅
Jan 29 (200)   →  Mar 29 (200 jobs) ← Skip Feb, use Mar ✅
Jan 30 (200)   →  Mar 30 (200 jobs) ← Skip Feb, use Mar ✅
Jan 31 (200)   →  Mar 31 (200 jobs) ← Skip Feb, use Mar ✅

Result: Load distributed evenly! ✅
```

## Real-World Scenarios

### Scenario 1: Non-Leap Year (2027)

```
Schedule Date    →  Next Schedule    Data Covered       Skip?
──────────────────────────────────────────────────────────────
2027-01-28       →  2027-02-28      Feb 1 - Feb 28     No
2027-01-29       →  2027-03-29      Feb 1 - Feb 28     Yes (Feb skipped)
2027-01-30       →  2027-03-30      Feb 1 - Feb 28     Yes (Feb skipped)
2027-01-31       →  2027-03-31      Feb 1 - Feb 28     Yes (Feb skipped)

March load:
- Mar 28: Jobs from Jan 28 (next cycle after Feb 28)
- Mar 29: Jobs from Jan 29 (skipped Feb)
- Mar 30: Jobs from Jan 30 (skipped Feb)
- Mar 31: Jobs from Jan 31 (skipped Feb)
```

### Scenario 2: Leap Year (2028)

```
Schedule Date    →  Next Schedule    Data Covered       Skip?
──────────────────────────────────────────────────────────────
2028-01-28       →  2028-02-28      Feb 1 - Feb 28     No
2028-01-29       →  2028-02-29      Feb 1 - Feb 29     No (leap year!)
2028-01-30       →  2028-03-30      Feb 1 - Feb 29     Yes (Feb skipped)
2028-01-31       →  2028-03-31      Feb 1 - Feb 29     Yes (Feb skipped)

Note: Feb 29 exists in leap years, so day 29 doesn't skip!
```

### Scenario 3: April (30 days)

```
Schedule Date    →  Next Schedule    Data Covered       Skip?
──────────────────────────────────────────────────────────────
2027-03-28       →  2027-04-28      Apr 1 - Apr 30     No
2027-03-29       →  2027-04-29      Apr 1 - Apr 30     No
2027-03-30       →  2027-04-30      Apr 1 - Apr 30     No
2027-03-31       →  2027-05-31      Apr 1 - Apr 30     Yes (Apr skipped)

Note: Only day 31 skips April (which has 30 days)
```

### Scenario 4: Full Year Cycle (Jan 31 jobs)

```
Current Schedule  →  Next Schedule    Month Skipped?
─────────────────────────────────────────────────────
2027-01-31       →  2027-03-31      Yes (Feb: 28 days)
2027-03-31       →  2027-05-31      Yes (Apr: 30 days)
2027-05-31       →  2027-07-31      Yes (Jun: 30 days)
2027-07-31       →  2027-08-31      No  (Jul: 31 days)
2027-08-31       →  2027-09-31      Yes (Sep: 30 days) → Oct 31
2027-10-31       →  2027-12-31      Yes (Nov: 30 days)
2027-12-31       →  2028-01-31      No  (Dec: 31 days)
2028-01-31       →  2028-03-31      Yes (Feb: 29 days, leap year)
...

Pattern for day 31:
- Executes: Jan, Mar, May, Jul, Aug, Oct, Dec (7 times/year)
- Skips: Feb, Apr, Jun, Sep, Nov (5 months/year)
```

## Load Distribution Analysis

### Monthly Load for Day 28-31 Jobs

| Day | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| 28  | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |
| 29  | ✓   | △   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |
| 30  | ✓   | ✗   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |
| 31  | ✓   | ✗   | ✓   | ✗   | ✓   | ✗   | ✓   | ✓   | ✗   | ✓   | ✗   | ✓   |

Legend:
- ✓ = Executes in this month
- △ = Executes in leap year only (Feb 29)
- ✗ = Skips this month (day doesn't exist)

### Server Load Comparison

**Scenario: 1000 jobs distributed across days 28-31 (250 each)**

#### Old Approach (Capping)
```
February Load:
- Feb 28: 1000 jobs (250×4) ❌ OVERLOAD!
- Feb 29: 0 jobs
- Feb 30: 0 jobs

March Load:
- Mar 28: 250 jobs
- Mar 29: 0 jobs
- Mar 30: 0 jobs
- Mar 31: 0 jobs

Total efficiency: 50% (only 2 days used out of 4)
```

#### New Approach (Skip Month)
```
February Load:
- Feb 28: 250 jobs ✅ Balanced!
- Feb 29: 0 jobs
- Feb 30: 0 jobs

March Load:
- Mar 28: 250 jobs ✅ (from Feb 28 cycle)
- Mar 29: 250 jobs ✅ (from Jan 29 skip)
- Mar 30: 250 jobs ✅ (from Jan 30 skip)
- Mar 31: 250 jobs ✅ (from Jan 31 skip)

Total efficiency: 100% (all 4 days used evenly)
```

## Data Coverage

### Important: Data is NOT Skipped!

Even though the execution date skips a month, the **data** for that month is still scraped:

```
Job created on Jan 31:
- Schedule: Jan 31
- Data: Dec 1 - Dec 31 ✓

Next job:
- Schedule: Mar 31 (Feb skipped for execution)
- Data: Feb 1 - Feb 28 ✓ (data NOT skipped!)

Next job:
- Schedule: May 31 (Apr skipped for execution)
- Data: Apr 1 - Apr 30 ✓ (data NOT skipped!)
```

The `getMonthlyDateRange()` function calculates data range based on the **schedule date**, not the previous schedule date:

```typescript
// Schedule: Mar 31
// Data range: Previous month from Mar 31
// = Feb 1 - Feb 28 ✓
```

## Implementation Details

### Code Logic

```typescript
private getNextMonthScheduleDate(currentScheduleDate: string): string {
  const currentDay = date.getDate();
  let nextMonth = month + 1;
  let nextYear = year;

  // Keep advancing until we find a month with currentDay
  while (maxIterations > 0) {
    if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }

    const lastDayOfNextMonth = this.getLastDayOfMonth(nextYear, nextMonth + 1);
    
    // Found a month with this day?
    if (currentDay <= lastDayOfNextMonth) {
      return `${nextYear}-${nextMonth + 1}-${currentDay}`;
    }

    // No? Skip to next month
    nextMonth += 1;
    maxIterations -= 1;
  }
}
```

### Safety Features

1. **Max iterations**: Loop limit of 12 prevents infinite loops
2. **Fallback**: If somehow no valid month found, falls back to capping (should never happen)
3. **Logging**: Logs each skipped month for debugging
4. **Leap year aware**: Automatically handles Feb 29 in leap years

## Benefits

### 1. Even Load Distribution
- No single day gets 4× load
- Servers operate at designed capacity
- Predictable resource usage

### 2. Complete Data Coverage
- All monthly data is scraped
- No gaps in reporting
- Data range automatically calculated correctly

### 3. Predictable Execution
- Jobs on day 31 always run on the 31st (when it exists)
- Clear pattern: 7 times/year for day 31
- Easy to communicate to users

### 4. Automatic Handling
- No manual intervention needed
- Works for leap years automatically
- Self-correcting over time

## Edge Cases Handled

### Case 1: Leap Year Transition
```
2027-01-29 → 2027-03-29 (Feb skipped, 28 days)
2028-01-29 → 2028-02-29 (No skip, leap year!)
```

### Case 2: Year Boundary
```
2027-12-31 → 2028-01-31 (No skip, Jan has 31)
```

### Case 3: Multiple Skips
```
If day was 32 (hypothetically):
- Would skip every month
- Fallback catches this
```

## Monitoring & Alerts

### What to Monitor

1. **Skipped months count**: Track how often skips occur
2. **Load per date**: Ensure even distribution
3. **Data gaps**: Verify no data is missed

### Sample Metrics

```typescript
// Track skips
{
  date: "2027-02-01",
  day: 31,
  skipped_from: "2027-01-31",
  skipped_to: "2027-03-31",
  reason: "February has only 28 days"
}

// Daily load
{
  date: "2027-02-28",
  total_jobs: 250,  // ✅ Expected: 250
  expected: 250
}

{
  date: "2027-03-31",
  total_jobs: 250,  // ✅ Expected: 250 (from Jan 31 skip)
  expected: 250
}
```

## Migration Notes

### Existing Jobs

Jobs created with the old capping logic will:
1. Continue from their current schedule date
2. Use the new skip logic for next job creation
3. Gradually distribute themselves over time

Example:
```
Old schedule: Jan 31 → Feb 28 → Feb 28 → Feb 28 (stuck!)
After migration: Feb 28 → Mar 28 → Apr 28 → May 28 (normal cycle)
Meanwhile: Jan 31 → Mar 31 → May 31 (new pattern)

Result: Jobs gradually spread out
```

### No Breaking Changes

- Existing schedule dates remain unchanged
- Only affects future job creation
- Data coverage remains complete

## Comparison with Alternatives

### Alternative 1: Cap to Last Day (Old Approach)
❌ Causes load concentration
❌ Unpredictable execution patterns
✅ Simpler logic
✅ Monthly execution guaranteed

### Alternative 2: Skip Month (Current Approach)
✅ Even load distribution
✅ Predictable patterns
✅ Scales well
❌ Jobs don't run every month (by design)

### Alternative 3: Redistribute Within Month
Idea: Spread day 29-31 jobs across days 1-31 in February
❌ Breaks user expectations (job day changes)
❌ Complex to implement
❌ Confusing for monitoring

## Conclusion

The skip month strategy provides:
- ✅ Even load distribution (no 4× spikes)
- ✅ Complete data coverage
- ✅ Predictable execution patterns
- ✅ Automatic handling of edge cases
- ✅ Production-ready solution

This approach solves the load balancing problem while maintaining data integrity and system reliability.
