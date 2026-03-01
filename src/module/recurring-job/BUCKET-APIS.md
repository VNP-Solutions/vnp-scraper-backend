# Recurring Job Bucket APIs

This document describes the new APIs for filtering jobs by recurring report bucket and listing buckets by recurring job ID.

## Overview

Two new functionalities have been added:

1. **Filter jobs by `recurring_report_bucket_id`** - Added to the existing Job findAll API
2. **Get buckets by `recurring_id`** - New dedicated endpoint in RecurringJob module

---

## 1. Filter Jobs by Recurring Report Bucket ID

### Endpoint
```
GET /jobs?recurring_report_bucket_id={bucket_id}
```

### Description
The existing Job findAll API has been enhanced to support filtering by `recurring_report_bucket_id`. This allows you to retrieve all jobs that belong to a specific recurring report bucket.

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `recurring_report_bucket_id` | string | No | Filter jobs by recurring report bucket ID (MongoDB ObjectId) |
| `recurring_id` | string | No | Filter jobs by recurring job ID (MongoDB ObjectId) |
| (other existing params) | various | No | All existing job filter parameters are still supported |

### Example Request
```bash
GET /jobs?recurring_report_bucket_id=507f1f77bcf86cd799439011
```

### Example Response
```json
{
  "statusCode": 200,
  "message": "Jobs retrieved successfully",
  "data": [
    {
      "id": "507f1f77bcf86cd799439012",
      "name": "Sample Job - 2024-01 to 2024-02",
      "recurring_report_bucket_id": "507f1f77bcf86cd799439011",
      "recurring_id": "507f1f77bcf86cd799439010",
      "status": "Pending",
      // ... other job fields
    }
  ],
  "metadata": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

### Implementation Details

**File:** `src/module/job/job.repository.ts`

The filter is applied in the `findAll` method:

```typescript
// Filter by recurring_id
if (recurring_id) {
  allFilters.recurring_id = recurring_id.toString();
}

// Filter by recurring_report_bucket_id
if (recurring_report_bucket_id) {
  allFilters.recurring_report_bucket_id = recurring_report_bucket_id.toString();
}
```

---

## 2. Get Buckets by Recurring Job ID

### Endpoint
```
GET /recurring-jobs/:id/buckets
```

### Description
Retrieves all recurring report buckets associated with a specific recurring job, including the jobs within each bucket. Buckets are ordered by `bucket_number` in ascending order, and jobs within each bucket are ordered by `createdAt` in ascending order.

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The recurring job ID (MongoDB ObjectId) |

### Example Request
```bash
GET /recurring-jobs/507f1f77bcf86cd799439010/buckets
```

### Example Response
```json
{
  "statusCode": 200,
  "message": "Buckets retrieved successfully",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "recurring_id": "507f1f77bcf86cd799439010",
      "bucket_number": 1,
      "name": "Jan 2024 - Feb 2024",
      "createdAt": "2024-01-15T00:00:00.000Z",
      "updatedAt": "2024-01-15T00:00:00.000Z",
      "jobs": [
        {
          "id": "507f1f77bcf86cd799439012",
          "name": "Sample Job - 2024-01 to 2024-02",
          "recurring_report_bucket_id": "507f1f77bcf86cd799439011",
          "recurring_id": "507f1f77bcf86cd799439010",
          "status": "Completed",
          "start_date": "2024-01-01T00:00:00.000Z",
          "end_date": "2024-02-29T00:00:00.000Z",
          "schedule_date": "2024-03-15",
          "createdAt": "2024-01-15T00:00:00.000Z",
          // ... other job fields
        },
        {
          "id": "507f1f77bcf86cd799439013",
          "name": "Sample Job - 2024-03 to 2024-04",
          "recurring_report_bucket_id": "507f1f77bcf86cd799439011",
          "recurring_id": "507f1f77bcf86cd799439010",
          "status": "Pending",
          "start_date": "2024-03-01T00:00:00.000Z",
          "end_date": "2024-04-30T00:00:00.000Z",
          "schedule_date": "2024-05-15",
          "createdAt": "2024-03-15T00:00:00.000Z",
          // ... other job fields
        }
      ]
    },
    {
      "id": "507f1f77bcf86cd799439014",
      "recurring_id": "507f1f77bcf86cd799439010",
      "bucket_number": 2,
      "name": "May 2024 - Jun 2024",
      "createdAt": "2024-05-15T00:00:00.000Z",
      "updatedAt": "2024-05-15T00:00:00.000Z",
      "jobs": [
        {
          "id": "507f1f77bcf86cd799439015",
          "name": "Sample Job - 2024-05 to 2024-06",
          "recurring_report_bucket_id": "507f1f77bcf86cd799439014",
          "recurring_id": "507f1f77bcf86cd799439010",
          "status": "Pending",
          "start_date": "2024-05-01T00:00:00.000Z",
          "end_date": "2024-06-30T00:00:00.000Z",
          "schedule_date": "2024-07-15",
          "createdAt": "2024-05-15T00:00:00.000Z",
          // ... other job fields
        }
      ]
    }
  ]
}
```

### Error Responses

#### 404 - Recurring Job Not Found
```json
{
  "statusCode": 404,
  "message": "Recurring job not found"
}
```

#### 401 - Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### Implementation Details

**Files Modified:**

1. **`src/module/recurring-job/recurring-job.interface.ts`**
   - Added `getBucketsByRecurringId` method to `IRecurringJobService` interface

2. **`src/module/recurring-job/recurring-job.service.ts`**
   - Implemented `getBucketsByRecurringId` method that:
     - Validates the recurring job exists
     - Retrieves all buckets with their associated jobs
     - Returns ordered results

3. **`src/module/recurring-job/recurring-job.controller.ts`**
   - Added new `GET :id/buckets` endpoint
   - Includes Swagger documentation with `@ApiOperation` and `@ApiResponse` decorators
   - Protected with `JwtAuthGuard`

4. **`src/module/recurring-job/recurring-job.repository.ts`**
   - The existing `findBucketsByRecurringId` method is used (no changes needed)
   - Returns buckets ordered by `bucket_number` ascending
   - Includes jobs ordered by `createdAt` ascending

---

## Use Cases

### Use Case 1: View All Jobs in a Specific Bucket
When you want to see all jobs that belong to a particular reporting period (bucket), use the Job findAll API with the `recurring_report_bucket_id` filter.

**Example:**
```bash
GET /jobs?recurring_report_bucket_id=507f1f77bcf86cd799439011&sortBy=createdAt&sortOrder=asc
```

### Use Case 2: View Bucket History for a Recurring Job
When you want to see the complete history of all buckets and jobs for a recurring job, use the buckets endpoint.

**Example:**
```bash
GET /recurring-jobs/507f1f77bcf86cd799439010/buckets
```

This will show:
- All buckets created for the recurring job
- Jobs within each bucket
- The progression of scraping periods over time

### Use Case 3: Combined Filtering
You can combine the `recurring_id` filter with other job filters to get specific subsets of recurring jobs.

**Example:** Get all pending jobs for a recurring job
```bash
GET /jobs?recurring_id=507f1f77bcf86cd799439010&status=Pending
```

---

## Authentication

Both endpoints require JWT authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

---

## Notes

- Bucket numbers increment automatically as new buckets are created
- Each bucket can hold up to `duration` number of jobs (where `duration` is the recurring job's duration in months)
- When a bucket is full, a new bucket is automatically created with an incremented bucket number
- Jobs in buckets are immutable once created; they track historical scraping operations
- The bucket name format is typically: `{start_month} {start_year} - {end_month} {end_year}`
