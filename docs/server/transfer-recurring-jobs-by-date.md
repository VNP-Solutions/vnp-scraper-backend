# Transfer Recurring Jobs By Date API

## Overview

This API endpoint allows you to transfer all recurring jobs scheduled on a specific date to another date. This is useful for bulk rescheduling operations when you need to move all jobs from one day to another.

The API will:
1. Find all recurring jobs that have `schedule_date` matching the source date
2. For each recurring job, update all associated jobs' `schedule_date`
3. Update each recurring job's `schedule_date` and `next_date`
4. Update the scheduler (remove jobs from source date, add to target date)

## Endpoint

```
POST /recurring-jobs/transfer-by-date
```

## Authentication

Requires JWT authentication via Bearer token.

## Request Body

Both fields are required:

```typescript
{
  from_date: string;    // Source date in YYYY-MM-DD format
  to_date: string;      // Target date in YYYY-MM-DD format
}
```

### Validation Rules

- Both dates must be in YYYY-MM-DD format
- `from_date` and `to_date` must be different
- Both fields are required

## Response

```typescript
{
  statusCode: 200,
  message: string,                          // Success message with count
  data: {
    recurringJobsUpdated: number;          // Number of recurring jobs transferred
    totalJobsUpdated: number;              // Total number of jobs updated
    schedulerUpdated: boolean;             // Whether scheduler was updated (always true)
    recurringJobs: Array<{                 // Details of each transferred recurring job
      id: string;                          // Recurring job ID
      name: string;                        // Recurring job name
      jobCount: number;                    // Number of jobs in this recurring job
    }>;
  }
}
```

## Example

### Request

```bash
curl -X POST http://localhost:3000/recurring-jobs/transfer-by-date \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from_date": "2026-05-15",
    "to_date": "2026-06-20"
  }'
```

### Response

```json
{
  "statusCode": 200,
  "message": "Successfully transferred 8 recurring job(s) from 2026-05-15 to 2026-06-20",
  "data": {
    "recurringJobsUpdated": 8,
    "totalJobsUpdated": 96,
    "schedulerUpdated": true,
    "recurringJobs": [
      {
        "id": "507f1f77bcf86cd799439011",
        "name": "Hilton Garden Inn - Expedia",
        "jobCount": 12
      },
      {
        "id": "507f1f77bcf86cd799439012",
        "name": "Holiday Inn Express - Booking",
        "jobCount": 12
      },
      {
        "id": "507f1f77bcf86cd799439013",
        "name": "Courtyard Marriott - Agoda",
        "jobCount": 12
      },
      {
        "id": "507f1f77bcf86cd799439014",
        "name": "Hampton Inn - Expedia",
        "jobCount": 12
      },
      {
        "id": "507f1f77bcf86cd799439015",
        "name": "Fairfield Inn - Booking",
        "jobCount": 12
      },
      {
        "id": "507f1f77bcf86cd799439016",
        "name": "SpringHill Suites - Agoda",
        "jobCount": 12
      },
      {
        "id": "507f1f77bcf86cd799439017",
        "name": "Residence Inn - Expedia",
        "jobCount": 12
      },
      {
        "id": "507f1f77bcf86cd799439018",
        "name": "TownePlace Suites - Booking",
        "jobCount": 12
      }
    ]
  }
}
```

## Error Responses

### 400 Bad Request - No Recurring Jobs Found

```json
{
  "statusCode": 400,
  "message": "No recurring jobs found scheduled on 2026-05-15"
}
```

### 400 Bad Request - Same Dates

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "message": "from_date and to_date must be different"
    }
  ]
}
```

### 400 Bad Request - Invalid Date Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "path": ["from_date"],
      "message": "Date must be in YYYY-MM-DD format"
    }
  ]
}
```

### 400 Bad Request - Missing Fields

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "path": ["from_date"],
      "message": "Required"
    },
    {
      "path": ["to_date"],
      "message": "Required"
    }
  ]
}
```

## Behavior Details

### What Gets Updated

For each recurring job found on `from_date`:

1. **All Jobs Under the Recurring Job:**
   - `schedule_date` is updated from `from_date` to `to_date`

2. **The Recurring Job Itself:**
   - `schedule_date` is updated from `from_date` to `to_date`
   - `next_date` is updated from `from_date` to `to_date`

3. **Scheduler:**
   - All jobs are removed from the scheduler entry for `from_date`
   - All jobs are added to the scheduler entry for `to_date`
   - This happens for all active recurring jobs

### Active vs Inactive Recurring Jobs

- The API finds recurring jobs based on `schedule_date` only
- Scheduler is updated for **all** recurring jobs (both active and inactive)
- Inactive recurring jobs will have their dates updated but won't execute until reactivated

### What Doesn't Change

- Job status (Pending, Running, Completed, Failed, Stopped)
- Job data (start_date, end_date, property info, etc.)
- Bucket assignments
- Job relationships
- Any other job or recurring job fields

## Use Cases

### 1. System Maintenance

If you need to perform system maintenance on 2026-05-15 and want to move all scheduled jobs to the next day:

```bash
curl -X POST http://localhost:3000/recurring-jobs/transfer-by-date \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from_date": "2026-05-15",
    "to_date": "2026-05-16"
  }'
```

### 2. Holiday Rescheduling

If a holiday falls on 2026-05-15 and you want to move all jobs to the following Monday (2026-05-18):

```bash
curl -X POST http://localhost:3000/recurring-jobs/transfer-by-date \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from_date": "2026-05-15",
    "to_date": "2026-05-18"
  }'
```

### 3. Load Balancing

If too many jobs are scheduled on 2026-05-15, you can distribute them to another less busy day:

```bash
curl -X POST http://localhost:3000/recurring-jobs/transfer-by-date \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from_date": "2026-05-15",
    "to_date": "2026-05-22"
  }'
```

### 4. Client Request

If a client requests all their reports to be generated on a different day:

```bash
# First check which recurring jobs are on the date
curl -X GET "http://localhost:3000/recurring-jobs?schedule_date=2026-05-15" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Then transfer them
curl -X POST http://localhost:3000/recurring-jobs/transfer-by-date \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from_date": "2026-05-15",
    "to_date": "2026-06-01"
  }'
```

## Implementation Files

The following files were created/modified to implement this feature:

1. **DTO** (`src/module/recurring-job/recurring-job.dto.ts`)
   - Added `TransferRecurringJobsByDateDto`

2. **Validation** (`src/module/recurring-job/recurring-job.validation.ts`)
   - Added `transferRecurringJobsByDateSchema`

3. **Service** (`src/module/recurring-job/recurring-job.service.ts`)
   - Added `transferRecurringJobsByDate()` method

4. **Controller** (`src/module/recurring-job/recurring-job.controller.ts`)
   - Added `POST /transfer-by-date` endpoint

5. **Interface** (`src/module/recurring-job/recurring-job.interface.ts`)
   - Added method signature to `IRecurringJobService`

## Comparison with Update All Jobs API

| Feature | Transfer By Date | Update All Jobs |
|---------|------------------|-----------------|
| Scope | All recurring jobs on a date | Single recurring job |
| Trigger | Date-based | ID-based |
| Status Change | No | Yes (Failed → Pending) |
| Date Change | Yes (mandatory) | Yes (optional) |
| Use Case | Bulk rescheduling | Individual job management |

## Notes

- This is a bulk operation that affects multiple recurring jobs at once
- All updates are atomic per recurring job (if one fails, others still succeed)
- The operation is logged for each recurring job transferred
- The scheduler is automatically updated for all affected jobs
- If no recurring jobs are found on `from_date`, the API returns an error
- This endpoint requires both dates to be provided (unlike the update-all-jobs endpoint which allows optional fields)
- The response includes detailed information about each transferred recurring job for audit purposes

## Performance Considerations

- The operation processes recurring jobs sequentially
- Each recurring job's jobs are updated in a loop
- For large numbers of recurring jobs or jobs per recurring job, the operation may take some time
- Consider the number of recurring jobs on the source date before running this operation during peak hours
