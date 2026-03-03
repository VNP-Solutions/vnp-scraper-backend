# Get All Jobs in a Bucket API

## Overview

New endpoint to retrieve all jobs within a specific recurring report bucket. Returns a simple array of jobs without pagination or filters.

## Endpoint

```
GET /recurring-jobs/bucket/:bucketId/jobs
```

## Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bucketId` | string | Yes | The bucket ID (MongoDB ObjectId) |

## Request Example

```bash
GET /recurring-jobs/bucket/507f1f77bcf86cd799439014/jobs
Authorization: Bearer YOUR_JWT_TOKEN
```

## Response

### Success Response (200)

```json
{
  "statusCode": 200,
  "message": "Jobs retrieved successfully",
  "data": [
    {
      "id": "507f1f77bcf86cd799439015",
      "name": "DoubleTree by Hilton - Expedia - 2026-02-01 to 2026-02-28",
      "job_status": "Completed",
      "recurring_id": "507f1f77bcf86cd799439010",
      "recurring_report_bucket_id": "507f1f77bcf86cd799439014",
      "portfolio_name": "Crescent Hotels & Resorts",
      "property_name": "DoubleTree by Hilton South Charlotte",
      "ota_provider": "Expedia",
      "start_date": "2026-02-01",
      "end_date": "2026-02-28",
      "schedule_date": "2026-03-15",
      "billing_type": "VCC",
      "remaining_direct_billed": 0,
      "total_collectable": 1250.50,
      "total_amount_confirmed": 1250.50,
      "createdAt": "2026-02-15T00:00:00.000Z",
      "updatedAt": "2026-03-15T10:30:00.000Z"
    },
    {
      "id": "507f1f77bcf86cd799439016",
      "name": "DoubleTree by Hilton - Expedia - 2026-03-01 to 2026-03-31",
      "job_status": "Running",
      "recurring_id": "507f1f77bcf86cd799439010",
      "recurring_report_bucket_id": "507f1f77bcf86cd799439014",
      "portfolio_name": "Crescent Hotels & Resorts",
      "property_name": "DoubleTree by Hilton South Charlotte",
      "ota_provider": "Expedia",
      "start_date": "2026-03-01",
      "end_date": "2026-03-31",
      "schedule_date": "2026-04-15",
      "billing_type": "VCC",
      "remaining_direct_billed": 0,
      "total_collectable": 0,
      "total_amount_confirmed": 0,
      "createdAt": "2026-03-15T00:00:00.000Z",
      "updatedAt": "2026-04-15T09:00:00.000Z"
    }
  ]
}
```

### Error Response (404)

```json
{
  "statusCode": 404,
  "message": "Bucket not found"
}
```

### Error Response (401)

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

## Response Details

### Data Structure

Returns a **flat array** of Job objects. No pagination, no metadata - just the jobs.

```typescript
{
  statusCode: number;
  message: string;
  data: Job[];  // Simple array of all jobs in the bucket
}
```

### Job Object Fields

Each job includes all standard job fields:
- `id` - Job ID
- `name` - Job name
- `job_status` - Status (Pending, Running, Completed, Failed, etc.)
- `recurring_id` - Parent recurring job ID
- `recurring_report_bucket_id` - Bucket ID
- `portfolio_name` - Portfolio name
- `property_name` - Property name
- `ota_provider` - OTA provider
- `start_date` - Scraping start date
- `end_date` - Scraping end date
- `schedule_date` - When job is scheduled to run
- `billing_type` - Billing type (VCC, DB, etc.)
- Financial fields (remaining_direct_billed, total_collectable, etc.)
- Timestamps (createdAt, updatedAt)

## Features

### ✅ Simple and Fast
- **No Pagination** - Returns all jobs at once
- **No Filters** - All jobs in the bucket
- **No Sorting Options** - Jobs ordered by creation date (ascending)
- **Lightweight** - Just the data you need

### ✅ Use Cases

1. **Download All Jobs** - Get complete job list for export
2. **Batch Processing** - Process all jobs in a bucket
3. **Reporting** - Generate reports for a specific period
4. **Analysis** - Analyze all jobs in a reporting cycle

### ⚠️ Important Notes

- **No Limit** - Returns ALL jobs (could be 100+ jobs per bucket)
- **Ordered by createdAt** - Jobs are sorted chronologically
- **Read-Only** - This endpoint only retrieves data

## Comparison with Other Endpoints

### GET /recurring-jobs/bucket/:bucketId/jobs
- ✅ All jobs in one bucket
- ✅ No pagination
- ✅ No filters
- ✅ Simple array response
- Use when: You need ALL jobs from a specific bucket

### GET /jobs?recurring_report_bucket_id={bucketId}
- ✅ Jobs filtered by bucket
- ✅ Pagination support
- ✅ All job filters available
- ✅ Metadata included
- Use when: You need paginated/filtered job list

### GET /recurring-jobs/:id/buckets
- ✅ All buckets with counts
- ❌ No job details
- ✅ Pagination support
- Use when: You need bucket overview

## Usage Examples

### Example 1: Get All Jobs in a Bucket

```bash
curl -X GET "http://localhost:3000/api/recurring-jobs/bucket/507f1f77bcf86cd799439014/jobs" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Example 2: Export Jobs to CSV

```typescript
async function exportBucketJobs(bucketId: string) {
  const response = await fetch(
    `/recurring-jobs/bucket/${bucketId}/jobs`,
    {
      headers: { 
        'Authorization': `Bearer ${token}` 
      }
    }
  );
  
  const { data: jobs } = await response.json();
  
  // Convert to CSV
  const csv = convertToCSV(jobs);
  downloadFile(csv, 'bucket-jobs.csv');
}
```

### Example 3: Calculate Bucket Totals

```typescript
async function calculateBucketTotals(bucketId: string) {
  const response = await fetch(
    `/recurring-jobs/bucket/${bucketId}/jobs`
  );
  
  const { data: jobs } = await response.json();
  
  const totals = {
    totalCollectable: jobs.reduce((sum, job) => 
      sum + job.total_collectable, 0
    ),
    totalConfirmed: jobs.reduce((sum, job) => 
      sum + job.total_amount_confirmed, 0
    ),
    completed: jobs.filter(j => j.job_status === 'Completed').length,
    failed: jobs.filter(j => j.job_status === 'Failed').length,
  };
  
  return totals;
}
```

## Performance Considerations

### Small Buckets (< 50 jobs)
- ✅ Very fast
- ✅ Small response size
- ✅ Perfect for this endpoint

### Medium Buckets (50-100 jobs)
- ✅ Still acceptable
- ⚠️ Response size ~200-500KB
- ✅ Use this endpoint

### Large Buckets (> 100 jobs)
- ⚠️ Slower response
- ⚠️ Large response size (> 500KB)
- 💡 Consider using paginated Job API instead

## Implementation Details

### Repository Layer

```typescript
async findBucketWithJobs(bucketId: string) {
  return await this.db.recurringReportBucket.findUnique({
    where: { id: bucketId },
    include: {
      jobs: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}
```

### Service Layer

```typescript
async getBucketJobs(bucketId: string): Promise<Job[]> {
  const bucket = await this.repository.findBucketWithJobs(bucketId);
  
  if (!bucket) {
    throw new NotFoundException('Bucket not found');
  }
  
  return bucket.jobs;
}
```

### Controller Layer

```typescript
@Get('bucket/:bucketId/jobs')
async getBucketJobs(
  @Param('bucketId') bucketId: string,
  @Res() response: Response,
) {
  const jobs = await this.recurringJobService.getBucketJobs(bucketId);
  return {
    statusCode: 200,
    message: 'Jobs retrieved successfully',
    data: jobs,
  };
}
```

## Files Modified

- ✅ `src/module/recurring-job/recurring-job.repository.ts` - Added `findBucketWithJobs`
- ✅ `src/module/recurring-job/recurring-job.service.ts` - Added `getBucketJobs`
- ✅ `src/module/recurring-job/recurring-job.interface.ts` - Added interface methods
- ✅ `src/module/recurring-job/recurring-job.controller.ts` - Added endpoint

## Testing

### Test Case 1: Valid Bucket ID

```bash
GET /recurring-jobs/bucket/507f1f77bcf86cd799439014/jobs
```

Expected:
- Status: 200
- Returns array of jobs
- Jobs ordered by createdAt ascending

### Test Case 2: Invalid Bucket ID

```bash
GET /recurring-jobs/bucket/invalid-id/jobs
```

Expected:
- Status: 404
- Message: "Bucket not found"

### Test Case 3: Empty Bucket

```bash
GET /recurring-jobs/bucket/507f1f77bcf86cd799439999/jobs
```

Expected:
- Status: 200
- Returns empty array `[]`

## Summary

New endpoint `GET /recurring-jobs/bucket/:bucketId/jobs` provides:
- ✅ Simple array of all jobs in a bucket
- ✅ No pagination or filters
- ✅ Jobs ordered by creation date
- ✅ Perfect for exports and batch operations
- ✅ Lightweight and fast for small-medium buckets

Use this when you need the complete job list from a specific bucket without pagination complexity!
