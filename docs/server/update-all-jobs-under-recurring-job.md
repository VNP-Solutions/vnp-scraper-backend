# Update All Jobs Under Recurring Job API

## Overview

This API endpoint allows you to update all jobs associated with a recurring job. It supports two main operations:

1. **Change job status from Failed to Pending**: Resets all failed jobs to pending status
2. **Update recurring date**: Changes the schedule_date for all jobs and updates the scheduler

You can update either one or both of these at once.

## Endpoint

```
PUT /recurring-jobs/:id/update-all-jobs
```

## Authentication

Requires JWT authentication via Bearer token.

## Request Parameters

### Path Parameters

- `id` (string, required): The ID of the recurring job

### Request Body

At least one of the following fields must be provided:

```typescript
{
  change_failed_to_pending?: boolean;  // Set to true to change Failed jobs to Pending
  new_recurring_date?: string;        // New date in YYYY-MM-DD format
}
```

## Response

```typescript
{
  statusCode: 200,
  message: "All jobs under recurring job updated successfully",
  data: {
    updatedJobsCount: number;        // Number of jobs updated
    schedulerUpdated: boolean;       // Whether the scheduler was updated
    message: string;                 // Detailed message about what was updated
  }
}
```

## Examples

### Example 1: Change Failed Jobs to Pending

**Request:**
```bash
curl -X PUT http://localhost:3000/recurring-jobs/507f1f77bcf86cd799439011/update-all-jobs \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "change_failed_to_pending": true
  }'
```

**Response:**
```json
{
  "statusCode": 200,
  "message": "All jobs under recurring job updated successfully",
  "data": {
    "updatedJobsCount": 5,
    "schedulerUpdated": false,
    "message": "Changed 5 job(s) from Failed to Pending"
  }
}
```

### Example 2: Update Recurring Date

**Request:**
```bash
curl -X PUT http://localhost:3000/recurring-jobs/507f1f77bcf86cd799439011/update-all-jobs \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "new_recurring_date": "2026-06-15"
  }'
```

**Response:**
```json
{
  "statusCode": 200,
  "message": "All jobs under recurring job updated successfully",
  "data": {
    "updatedJobsCount": 12,
    "schedulerUpdated": true,
    "message": "Updated recurring date from 2026-05-15 to 2026-06-15 for 12 job(s) and updated scheduler"
  }
}
```

### Example 3: Update Both Status and Date

**Request:**
```bash
curl -X PUT http://localhost:3000/recurring-jobs/507f1f77bcf86cd799439011/update-all-jobs \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "change_failed_to_pending": true,
    "new_recurring_date": "2026-06-15"
  }'
```

**Response:**
```json
{
  "statusCode": 200,
  "message": "All jobs under recurring job updated successfully",
  "data": {
    "updatedJobsCount": 5,
    "schedulerUpdated": true,
    "message": "Changed 5 job(s) from Failed to Pending. Updated recurring date from 2026-05-15 to 2026-06-15 for 12 job(s) and updated scheduler"
  }
}
```

## Error Responses

### 400 Bad Request - No Fields Provided

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "message": "At least one of change_failed_to_pending or new_recurring_date must be provided"
    }
  ]
}
```

### 400 Bad Request - No Jobs Found

```json
{
  "statusCode": 400,
  "message": "No jobs found under this recurring job"
}
```

### 404 Not Found - Recurring Job Not Found

```json
{
  "statusCode": 404,
  "message": "Recurring job with ID 507f1f77bcf86cd799439011 not found"
}
```

### 400 Bad Request - Invalid Date Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "path": ["new_recurring_date"],
      "message": "Date must be in YYYY-MM-DD format"
    }
  ]
}
```

## Behavior Details

### Change Status from Failed to Pending

- Only affects jobs with `job_status: "Failed"`
- Updates job status to `JobStatus.Pending`
- Does not affect jobs with other statuses (Running, Completed, Stopped, Pending)
- If no failed jobs are found, returns a message indicating this

### Update Recurring Date

- Updates `schedule_date` for ALL jobs under the recurring job
- Updates the recurring job's `schedule_date` and `next_date` fields
- **Scheduler Update (if recurring job is active):**
  - Removes all job IDs from the old schedule date
  - Adds all job IDs to the new schedule date
- **Scheduler Update (if recurring job is inactive):**
  - Scheduler is NOT updated
  - Response message indicates that the recurring job is inactive

### Combined Update

When both fields are provided:
- Status update is performed first
- Date update is performed second
- Both operations are logged separately in the response message
- `updatedJobsCount` reflects the status update count (failed jobs changed to pending)
- Scheduler is updated if the recurring job is active

## Implementation Files

The following files were created/modified to implement this feature:

1. **DTO** (`src/module/recurring-job/recurring-job.dto.ts`)
   - Added `UpdateAllJobsUnderRecurringJobDto`

2. **Validation** (`src/module/recurring-job/recurring-job.validation.ts`)
   - Added `updateAllJobsUnderRecurringJobSchema`

3. **Service** (`src/module/recurring-job/recurring-job.service.ts`)
   - Added `updateAllJobsUnderRecurringJob()` method

4. **Controller** (`src/module/recurring-job/recurring-job.controller.ts`)
   - Added `PUT /:id/update-all-jobs` endpoint

5. **Interface** (`src/module/recurring-job/recurring-job.interface.ts`)
   - Added method signature to `IRecurringJobService`

## Use Cases

1. **Retry Failed Jobs**: If a batch of jobs failed due to a temporary issue (server down, network issue), you can reset them all to Pending to retry them.

2. **Reschedule All Jobs**: If you need to move all jobs to a different date (e.g., client request, system maintenance), you can update the recurring date and the scheduler will be automatically updated.

3. **Fix and Reschedule**: If jobs failed and you also need to reschedule them, you can do both operations in a single API call.

## Notes

- This endpoint is useful for bulk operations on all jobs under a recurring job
- The scheduler is only updated if the recurring job is active (`is_active: true`)
- All updates are logged for audit purposes
- The endpoint requires at least one of the two fields to be provided
- Date format must strictly follow YYYY-MM-DD format
