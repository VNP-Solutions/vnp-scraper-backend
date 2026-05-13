# Job Execution with Server URL - Implementation Guide

## Overview

This guide explains how to implement job execution logic to use the assigned server's URL instead of the default ENV URL.

## Key Changes

### 1. Server Assignment Strategy (Updated)
- **Priority**: Server with **highest** job count (but < 200) gets assigned first
- **Reasoning**: Maximizes server utilization before adding load to new servers
- **Example**: If Server A has 150 jobs and Server B has 50 jobs, new jobs go to Server A first

### 2. Server Continuity in Recurring Jobs
When the scheduler creates the next month's job:
- It passes the current job's `server_id` to the new job
- The new job runs on the **same server** as the previous job
- This ensures consistency and predictability

## Implementation in Scraper Service

### Step 1: Fetch Server URL

When a job is about to execute, check if it has a `server_id` and fetch the server URL:

```typescript
// In your scraper service or job execution logic
import { Inject } from '@nestjs/common';
import { IServerService } from '../server/server.interface';

export class ScraperService {
  constructor(
    @Inject('IServerService')
    private readonly serverService: IServerService,
  ) {}

  async executeJob(job: Job) {
    let scraperBaseURL: string;

    if (job.server_id) {
      try {
        // Fetch the server details
        const server = await this.serverService.findServerById(job.server_id);
        scraperBaseURL = server.url;
        
        this.logger.log(
          `Job ${job.id} will run on server "${server.name}" (${server.url})`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to fetch server ${job.server_id}, falling back to ENV URL: ${error.message}`,
        );
        scraperBaseURL = process.env.SCRAPER_BASE_URL || 'http://localhost:3000';
      }
    } else {
      // No server assigned, use ENV
      scraperBaseURL = process.env.SCRAPER_BASE_URL || 'http://localhost:3000';
      this.logger.log(`Job ${job.id} will run using ENV URL (${scraperBaseURL})`);
    }

    // Use scraperBaseURL for all scraping operations
    await this.performScraping(job, scraperBaseURL);
  }

  private async performScraping(job: Job, baseURL: string) {
    // Your scraping logic here
    // Use baseURL for all HTTP requests
    const response = await fetch(`${baseURL}/api/scrape`, {
      method: 'POST',
      body: JSON.stringify(job),
    });
    
    // Process response...
  }
}
```

### Step 2: Handle Server Errors

If the assigned server is unavailable or returns errors:

```typescript
async executeJob(job: Job) {
  let scraperBaseURL: string;
  let usingFallback = false;

  if (job.server_id) {
    try {
      const server = await this.serverService.findServerById(job.server_id);
      
      // Check if server is active
      if (!server.is_active) {
        this.logger.warn(
          `Server ${server.name} is inactive, using ENV URL as fallback`,
        );
        scraperBaseURL = process.env.SCRAPER_BASE_URL;
        usingFallback = true;
      } else {
        scraperBaseURL = server.url;
      }
    } catch (error) {
      this.logger.error(
        `Error accessing server ${job.server_id}, using ENV URL: ${error.message}`,
      );
      scraperBaseURL = process.env.SCRAPER_BASE_URL;
      usingFallback = true;
    }
  } else {
    scraperBaseURL = process.env.SCRAPER_BASE_URL;
  }

  try {
    await this.performScraping(job, scraperBaseURL);
  } catch (error) {
    if (!usingFallback && job.server_id) {
      // Retry with ENV URL if server fails
      this.logger.warn(
        `Scraping failed on assigned server, retrying with ENV URL`,
      );
      await this.performScraping(job, process.env.SCRAPER_BASE_URL);
    } else {
      throw error;
    }
  }
}
```

### Step 3: Update Job Completion Logic

When a job completes or fails, decrement the server count (if not already handled):

```typescript
async onJobComplete(job: Job) {
  // Update job status
  await this.jobService.updateJob(job.id, {
    job_status: JobStatus.Completed,
  });

  // Decrement server count if job has server_id
  if (job.server_id) {
    try {
      await this.serverService.decrementJobCount(job.server_id);
      this.logger.log(
        `Decremented job count for server ${job.server_id} after job ${job.id} completed`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to decrement server count: ${error.message}`,
      );
    }
  }

  // Continue with other completion logic...
}

async onJobFailed(job: Job) {
  // Update job status
  await this.jobService.updateJob(job.id, {
    job_status: JobStatus.Failed,
  });

  // Decrement server count if job has server_id
  if (job.server_id) {
    try {
      await this.serverService.decrementJobCount(job.server_id);
      this.logger.log(
        `Decremented job count for server ${job.server_id} after job ${job.id} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to decrement server count: ${error.message}`,
      );
    }
  }

  // Continue with other failure logic...
}
```

## Module Dependencies

Make sure the scraper module imports `ServerModule`:

```typescript
import { Module } from '@nestjs/common';
import { ServerModule } from '../server/server.module';
import { ScraperService } from './scraper.service';

@Module({
  imports: [ServerModule],
  providers: [ScraperService],
  exports: [ScraperService],
})
export class ScraperModule {}
```

## Environment Variables

Ensure your `.env` file has the default scraper URL:

```env
SCRAPER_BASE_URL=http://localhost:3000
# or
SCRAPER_BASE_URL=https://default-scraper.example.com
```

## Flow Diagram

```
Job Execution Flow:
┌─────────────────────────────────────────┐
│  Job is ready to execute                │
└─────────────────┬───────────────────────┘
                  │
                  ▼
          ┌───────────────┐
          │ Has server_id?│
          └───┬───────┬───┘
              │ YES   │ NO
              │       │
              ▼       ▼
    ┌──────────────┐  ┌────────────────┐
    │ Fetch Server │  │ Use ENV URL    │
    │ Details      │  │                │
    └──────┬───────┘  └────────┬───────┘
           │                   │
           ▼                   │
    ┌──────────────┐          │
    │ Server Active│          │
    │ & Available? │          │
    └──┬───────┬───┘          │
       │ YES   │ NO           │
       │       │              │
       ▼       ▼              │
  ┌─────────┐ ┌────────────┐ │
  │Use Server│ │Use ENV URL │ │
  │   URL    │ │ (Fallback) │ │
  └────┬─────┘ └─────┬──────┘ │
       │             │        │
       └─────────────┴────────┘
                     │
                     ▼
          ┌──────────────────┐
          │ Execute Scraping │
          └──────────┬───────┘
                     │
                     ▼
          ┌──────────────────┐
          │  Job Completes   │
          │   or Fails       │
          └──────────┬───────┘
                     │
                     ▼
          ┌──────────────────┐
          │ Has server_id?   │
          └───┬──────────────┘
              │ YES
              ▼
    ┌─────────────────────┐
    │ Decrement Server    │
    │ Job Count           │
    └─────────────────────┘
```

## Testing

### Test Scenarios

1. **Job with assigned server:**
   - Verify job uses server URL
   - Verify server job count increments on creation
   - Verify server job count decrements on completion

2. **Job without server (legacy):**
   - Verify job uses ENV URL
   - Verify no server operations are attempted

3. **Server becomes inactive:**
   - Verify job falls back to ENV URL
   - Verify graceful error handling

4. **Next month job creation:**
   - Verify new job uses same server as previous job
   - Verify server job count increases

5. **All servers at capacity:**
   - Verify new jobs are created with `server_id = null`
   - Verify jobs still execute using ENV URL

## Monitoring and Logging

Key log messages to watch for:

- `✓` "Job X will run on server Y (URL)"
- `✓` "Job X will run using ENV URL"
- `⚠` "Server X is inactive, using ENV URL as fallback"
- `⚠` "Failed to fetch server X, falling back to ENV URL"
- `✓` "Decremented job count for server X after job Y completed"
- `✗` "Failed to decrement server count"

## Performance Considerations

1. **Server Selection**: Highest job count first prevents server sprawl
2. **Caching**: Consider caching server URLs to reduce database queries
3. **Health Checks**: Implement server health checks before assignment
4. **Retry Logic**: Always have ENV URL as fallback for reliability

## Migration Path

### Phase 1: Deploy Server Module
- Deploy server module and schema changes
- Create initial servers
- Jobs still use ENV URL (no assignment yet)

### Phase 2: Enable Assignment for New Jobs
- Recurring job creation starts assigning servers
- Existing jobs continue using ENV URL
- Monitor server load distribution

### Phase 3: Update Job Execution Logic
- Implement server URL usage in scraper
- Test with subset of jobs
- Gradually roll out to all jobs

### Phase 4: Backfill Legacy Jobs (Optional)
- Create script to assign servers to existing jobs
- Run during off-peak hours
- Monitor for issues

## Configuration

Add server-related configuration options:

```typescript
// In your config service
export class ConfigService {
  // ... other config
  
  get scraperBaseURL(): string {
    return process.env.SCRAPER_BASE_URL || 'http://localhost:3000';
  }
  
  get serverEnabled(): boolean {
    return process.env.ENABLE_SERVER_ASSIGNMENT === 'true';
  }
  
  get serverCacheTTL(): number {
    return parseInt(process.env.SERVER_CACHE_TTL || '300', 10); // 5 minutes
  }
}
```

## Troubleshooting

### Issue: Jobs not using assigned server

**Check:**
1. Is `server_id` present in job record?
2. Is server active?
3. Is scraper service fetching server URL?
4. Check logs for errors

### Issue: Server job count incorrect

**Check:**
1. Are jobs being deleted without decrementing count?
2. Are jobs failing without decrementing count?
3. Run count validation script

**Fix:**
```typescript
// Validation script
async function validateServerCounts() {
  const servers = await serverService.findAllServers();
  
  for (const server of servers) {
    const actualCount = await db.job.count({
      where: { server_id: server.id },
    });
    
    if (actualCount !== server.job_count) {
      console.log(`Server ${server.name}: Expected ${server.job_count}, Found ${actualCount}`);
      // Update server count
      await serverService.update(server.id, { job_count: actualCount });
    }
  }
}
```

### Issue: All jobs going to one server

**Verify:**
1. Server selection logic (should be DESC for job_count)
2. Multiple active servers exist
3. Servers are not at capacity (200 jobs)

## Summary

The job execution flow now supports:
- ✅ Automatic server assignment (highest job count first)
- ✅ Server URL usage in job execution
- ✅ ENV URL fallback for reliability
- ✅ Server continuity in recurring jobs
- ✅ Proper job count management
- ✅ Graceful error handling

Next: Implement the scraper service changes to use server URLs!
