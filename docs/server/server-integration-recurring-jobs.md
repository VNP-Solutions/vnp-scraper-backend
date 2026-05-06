# Server Assignment in Recurring Jobs - Integration Documentation

## Overview

This document describes how the Server module is integrated with the Recurring Job module to automatically assign servers to jobs when they are created.

## Integration Flow

### 1. When Creating Recurring Jobs

When a recurring job is created (either through `POST /recurring-jobs` or `POST /recurring-jobs/from-job`), the system:

1. **Finds an available server**
   - Calls `serverService.findAvailableServer()`
   - Returns an active server with `job_count < 200`
   - Servers are prioritized by lowest job count (load balancing)

2. **Assigns server to job**
   - Sets `job.server_id` to the selected server's ID
   - If no server is available, `server_id` remains `null`
   - Job can still be created without a server (fallback to ENV URL)

3. **Increments server job count**
   - Calls `serverService.incrementJobCount(serverId)`
   - Updates `server.job_count` by +1
   - Validates that server hasn't reached capacity (200 jobs)

### 2. Job Creation Scenarios

#### Scenario A: Normal Recurring Job Creation
```typescript
// POST /recurring-jobs
{
  "schedule_date": "2026-03-15",
  "duration": 2,
  // ... other job data
}
```

**Flow:**
1. Creates `RecurringJob` record
2. Creates first `RecurringReportBucket`
3. **Assigns available server** → `server_id` set
4. **Increments server.job_count**
5. Creates first `Job` with `server_id`
6. Adds job to scheduler

#### Scenario B: Recurring Job with Historical Jobs
```typescript
// POST /recurring-jobs
{
  "schedule_date": "2026-03-15",
  "initial_date": "2026-01-01",
  "duration": 2,
  // ... other job data
}
```

**Flow:**
1. Creates `RecurringJob` record
2. Generates historical months (Jan, Feb)
3. For **each historical month**:
   - Creates bucket (if needed)
   - **Assigns available server** → unique `server_id` per job
   - **Increments server.job_count**
   - Creates job with `server_id`
4. All jobs scheduled for `schedule_date`

#### Scenario C: Create from Existing Job
```typescript
// POST /recurring-jobs/from-job
{
  "job_id": "507f...",
  "schedule_date": "2026-03-15",
  "duration": 1
}
```

**Flow:**
1. Fetches existing job template
2. Creates `RecurringJob`
3. Creates bucket
4. **Assigns available server** → `server_id` set
5. **Increments server.job_count**
6. Creates new job from template with `server_id`

### 3. When Jobs are Deleted

When a job is deleted (through `DELETE /jobs/:id`), the system:

1. **Fetches the job** to check if `server_id` exists
2. If `server_id` is present:
   - Calls `serverService.decrementJobCount(serverId)`
   - Updates `server.job_count` by -1
   - Logs the decrement operation
3. Deletes the job
4. If server decrement fails, logs error but continues with deletion

### 4. When Jobs Complete or Fail

**Note:** Currently, job completion/failure does not automatically decrement the server count. This needs to be implemented in the scraper/job execution logic.

**Recommended Implementation:**
```typescript
// In job completion handler
if (job.server_id && (job.job_status === 'Completed' || job.job_status === 'Failed')) {
  await serverService.decrementJobCount(job.server_id);
}
```

## Code Changes Summary

### 1. RecurringJobService (`recurring-job.service.ts`)

**Added:**
- Injected `IServerService` dependency
- Private method `assignServerToJob()`: Finds and assigns available server
- Server assignment in `createJobFromTemplate()` method
- Server assignment in direct job creation (historical jobs)
- Server assignment in normal job creation flow

**Key Methods:**
```typescript
private async assignServerToJob(): Promise<string | null> {
  const availableServer = await this.serverService.findAvailableServer();
  if (!availableServer) {
    this.logger.warn('No available server found');
    return null;
  }
  await this.serverService.incrementJobCount(availableServer.id);
  return availableServer.id;
}
```

### 2. RecurringJobModule (`recurring-job.module.ts`)

**Added:**
- Imported `ServerModule` to access `IServerService`

### 3. JobService (`job.service.ts`)

**Added:**
- Injected `IServerService` dependency
- Updated `deleteJob()` method to decrement server count on deletion

**Modified deleteJob Method:**
```typescript
async deleteJob(id: string): Promise<Job> {
  const job = await this.repository.findById(id);
  
  if (job && job.server_id) {
    await this.serverService.decrementJobCount(job.server_id);
  }
  
  return await this.repository.delete(id);
}
```

### 4. JobModule (`job.module.ts`)

**Added:**
- Imported `ServerModule` to access `IServerService`

## Database Schema

### Job Model (Updated)
```prisma
model Job {
  // ... existing fields
  server_id  String?  @db.ObjectId
  
  server     Server?  @relation(fields: [server_id], references: [id])
  // ...
}
```

## Server Assignment Behavior

### Load Balancing
- Servers are selected by **lowest job count first**
- This ensures even distribution of jobs across available servers

### Capacity Management
- Each server has a maximum capacity of **200 jobs**
- `findAvailableServer()` only returns servers with `job_count < 200`
- If a server reaches capacity, it's excluded from assignment

### Inactive Servers
- Only **active** servers (`is_active = true`) are considered for assignment
- Inactive servers are ignored even if they have capacity

### Fallback Behavior
- If no server is available:
  - `server_id` is set to `null`
  - Job is still created successfully
  - Job will use ENV-based URL (fallback behavior)
  - Warning is logged

## Using Server URL in Job Execution

When a job runs, the scraper should check for `server_id` and use the server's URL:

```typescript
// In scraper/job execution logic
let baseURL: string;

if (job.server_id) {
  const server = await serverService.findServerById(job.server_id);
  baseURL = server.url;
  logger.log(`Using server URL: ${baseURL}`);
} else {
  baseURL = process.env.DEFAULT_SCRAPER_URL;
  logger.log(`Using ENV URL: ${baseURL}`);
}

// Use baseURL for scraping operations
```

## Error Handling

### Server Assignment Errors
- If `findAvailableServer()` fails: Job created without `server_id` (fallback)
- If `incrementJobCount()` fails: Error logged, job still created
- If `decrementJobCount()` fails on deletion: Error logged, job still deleted

### Server Capacity Errors
- If all servers are at capacity: Warning logged, jobs created with `server_id = null`
- Jobs can still function using ENV-based URLs

## Monitoring and Logs

### Log Messages

**Server Assignment:**
```
Assigned server "Production Server 1" (ID: 507f...) to job
```

**No Available Server:**
```
No available server found for job assignment (all servers at capacity or inactive)
```

**Server Count Decrement:**
```
Decremented job count for server 507f... after deleting job 608a...
```

**Server Assignment Error:**
```
Error assigning server to job: [error details]
```

## Migration Required

After implementing these changes, run:

```bash
# Generate Prisma client with updated schema
npx prisma generate

# Push schema changes to database
npx prisma db push
```

Or create a migration:

```bash
npx prisma migrate dev --name add_server_id_to_jobs
```

## Next Steps

### 1. Implement Job Completion Logic
Update the job execution/scraper logic to:
- Decrement server count when jobs complete successfully
- Decrement server count when jobs fail permanently
- Handle retry scenarios appropriately

### 2. Create Initial Servers
Before creating recurring jobs, ensure at least one server exists:

```bash
# POST /servers
{
  "name": "Production Server 1",
  "url": "https://server1.example.com",
  "is_active": true
}
```

### 3. Update Job Execution to Use Server URL
Modify the scraper service to:
- Check for `job.server_id`
- Fetch server details
- Use `server.url` instead of ENV URL

### 4. Monitor Server Capacity
Regularly check server job counts:
```bash
# GET /servers?is_active=true
```

Add alerts when servers approach capacity (e.g., > 180 jobs).

## Testing Checklist

- [ ] Create recurring job without servers (should work with `server_id = null`)
- [ ] Create server and verify it's assigned to new recurring jobs
- [ ] Create multiple jobs and verify load balancing (job counts increase)
- [ ] Delete jobs and verify server counts decrement
- [ ] Test with server at capacity (200 jobs) - new jobs should use different server
- [ ] Test with all servers at capacity - jobs created with `server_id = null`
- [ ] Test with inactive server - should not be assigned
- [ ] Create recurring job with historical jobs - each job gets server assigned
- [ ] Verify server URLs are used in job execution
