# Date-Based Server Capacity Tracking Architecture

## Overview

The system has been upgraded from **global server capacity tracking** to **date-based capacity tracking**. This allows servers to handle jobs for multiple dates efficiently, preventing server underutilization.

## Problem Solved

### Old Architecture (Global Tracking)
- Server capacity tracked globally via `job_count`
- A server assigned 200 jobs for May 15th was marked as "full" permanently
- Server remained idle for the remaining 27+ days
- Massive underutilization of server resources

### New Architecture (Date-Based Tracking)
- Server capacity tracked **per date** via `ServerDailySchedule`
- A server can handle 200 jobs on May 15th AND 200 jobs on May 16th
- Servers are reused across multiple dates
- Optimal resource utilization

## Architecture Components

### 1. Database Schema

#### Server Model
```prisma
model Server {
  id                  String   @id @default(auto()) @map("_id") @db.ObjectId
  name                String   @unique
  url                 String
  job_count           Int      @default(0) // Deprecated: kept for backward compatibility
  max_concurrent_jobs Int      @default(200) // Maximum jobs per date
  is_active           Boolean  @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  jobs                Job[]
  dailySchedules      ServerDailySchedule[]

  @@map("servers")
}
```

#### ServerDailySchedule Model (NEW)
```prisma
model ServerDailySchedule {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  server_id     String   @db.ObjectId
  date          String   // Format: YYYY-MM-DD
  assigned_jobs Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  server Server @relation(fields: [server_id], references: [id], onDelete: Cascade)

  @@unique([server_id, date])
  @@index([date])
  @@index([server_id])
  @@map("server_daily_schedules")
}
```

### 2. Repository Methods

#### `findAvailableServerForDate(date: string)`
Finds the server with the most available capacity on a specific date.

```typescript
// Gets all active servers
// Checks their daily schedule for the date
// Calculates available capacity = max_concurrent_jobs - assigned_jobs
// Returns server with highest available capacity
```

#### `incrementDateCapacity(serverId: string, date: string)`
Increments the assigned job count for a server on a specific date.

```typescript
// Uses upsert: creates schedule if doesn't exist, increments if exists
await db.serverDailySchedule.upsert({
  where: { server_id_date: { server_id, date } },
  update: { assigned_jobs: { increment: 1 } },
  create: { server_id, date, assigned_jobs: 1 }
});
```

#### `decrementDateCapacity(serverId: string, date: string)`
Decrements the assigned job count when a job is deleted or rescheduled.

#### `moveJobBetweenDates(serverId, oldDate, newDate)`
Moves a job's capacity tracking from one date to another.

```typescript
// Decrements old date
// Increments new date
// Used when job's schedule_date changes
```

### 3. Service Layer

#### `assignServerForDate(scheduleDate: string)`
High-level method to assign a server for a specific date.

```typescript
async assignServerForDate(scheduleDate: string): Promise<string | null> {
  // Find available server for date
  const server = await repository.findAvailableServerForDate(scheduleDate);
  
  if (!server) return null;
  
  // Increment capacity for this date
  await repository.incrementDateCapacity(server.id, scheduleDate);
  
  return server.id;
}
```

## Integration Points

### 1. Job Creation (Recurring Jobs)

**Old Code:**
```typescript
const server_id = await this.assignServerToJob(); // No date awareness
```

**New Code:**
```typescript
const server_id = await this.assignServerToJob(schedule_date); // Date-aware
```

### 2. Job Deletion

**Old Code:**
```typescript
await this.serverService.decrementJobCount(job.server_id); // Global decrement
```

**New Code:**
```typescript
await this.serverService.decrementDateCapacity(job.server_id, job.schedule_date); // Date-based decrement
```

### 3. Job Update (Schedule Date Change)

**New Logic:**
```typescript
if (data.schedule_date !== existingJob.schedule_date) {
  // Move job capacity from old date to new date
  await this.serverService.moveJobBetweenDates(
    existingJob.server_id,
    existingJob.schedule_date,
    data.schedule_date
  );
}
```

## Example Scenario

### Scenario: 4000 jobs across 20 days

**Old System:**
```
Day 1 (May 15):
  - Server 1: 200 jobs assigned → FULL
  - Server 2: 200 jobs assigned → FULL
  - ...
  - Server 20: 200 jobs assigned → FULL

Days 2-31:
  - All 20 servers: IDLE (can't accept new jobs)
  - Need 20 MORE servers for each subsequent day
  - Total servers needed: 20 × 20 = 400 servers!
```

**New System:**
```
Day 1 (May 15):
  - Server 1: 200 jobs assigned for May 15
  - Server 2: 200 jobs assigned for May 15
  - ...
  - Server 20: 200 jobs assigned for May 15

Day 2 (May 16):
  - Server 1: 200 jobs assigned for May 16 (REUSED!)
  - Server 2: 200 jobs assigned for May 16 (REUSED!)
  - ...
  - Server 20: 200 jobs assigned for May 16 (REUSED!)

Days 3-31:
  - Same 20 servers handle all dates
  - Total servers needed: 20 servers (20× reduction!)
```

## Benefits

### 1. Resource Efficiency
- **20× reduction in server requirements** for the above scenario
- Servers fully utilized across all days
- No idle servers

### 2. Cost Savings
- Fewer servers needed
- Lower infrastructure costs
- Better ROI on server resources

### 3. Scalability
- Can handle unlimited dates with same server pool
- Easy to add capacity by adding servers
- Dynamic load balancing per date

### 4. Flexibility
- Jobs can be rescheduled without capacity conflicts
- Easy to move jobs between dates
- Better handling of schedule changes

## Monitoring & Analytics

### Get Server Schedule for Date
```typescript
const schedule = await serverService.getServerScheduleForDate(serverId, '2026-05-15');
// Returns: { server, assignedJobs, availableCapacity }
```

### Get Server Daily Schedules
```typescript
const schedules = await serverService.getServerDailySchedules(serverId, {
  startDate: '2026-05-01',
  endDate: '2026-05-31',
  page: 1,
  limit: 30
});
// Returns all daily schedules with pagination
```

## API Endpoints (Potential Future Additions)

```typescript
// Get server capacity for specific date
GET /servers/:id/capacity?date=2026-05-15

// Get server schedule overview
GET /servers/:id/schedule?startDate=2026-05-01&endDate=2026-05-31

// Get all servers' capacity for a date
GET /servers/capacity-overview?date=2026-05-15
```

## Migration Notes

### Backward Compatibility
- `job_count` field kept for backward compatibility
- Old methods (`incrementJobCount`, `decrementJobCount`) still work
- Gradual migration possible

### Data Migration
No data migration needed! The system automatically:
- Creates `ServerDailySchedule` records as jobs are assigned
- Uses upsert pattern for zero-downtime deployment
- Existing jobs continue to work

### Testing Strategy
1. Deploy schema changes
2. Monitor `ServerDailySchedule` collection creation
3. Verify job assignments use date-based tracking
4. Monitor server utilization improvements
5. Gradually phase out `job_count` usage

## Performance Considerations

### Database Indexes
```javascript
// Indexes created automatically by Prisma
{
  "server_id_date": { unique: true },  // Fast upserts
  "date": {},                           // Fast date lookups
  "server_id": {}                       // Fast server queries
}
```

### Query Performance
- **Single server lookup**: O(1) via unique index
- **All servers for date**: O(n) where n = active servers (typically < 100)
- **Date range queries**: O(m) where m = days in range

### Optimization Tips
1. Keep `max_concurrent_jobs` reasonable (100-500)
2. Monitor daily schedule collection growth
3. Archive old schedules after 90 days
4. Use date range filters for analytics

## Troubleshooting

### Issue: Server shows as full but has capacity
**Cause**: Stale `job_count` value (using old tracking)
**Solution**: Use date-based methods instead

### Issue: Jobs not assigned to any server
**Cause**: All servers at capacity for that date
**Solution**: 
- Add more servers
- Redistribute jobs to different dates
- Increase `max_concurrent_jobs` per server

### Issue: Negative `assigned_jobs` count
**Cause**: Decrement called without matching increment
**Solution**: Repository handles this gracefully (warns and returns)

## Future Enhancements

### 1. Load Balancing Algorithms
```typescript
// Current: Most available capacity first
// Future options:
// - Round-robin
// - Least recently used
// - Geographic distribution
// - Priority-based assignment
```

### 2. Auto-scaling
```typescript
// Automatically add/remove servers based on:
// - Date capacity predictions
// - Historical usage patterns
// - Real-time demand
```

### 3. Server Health Monitoring
```typescript
// Track server health per date:
// - Success rate
// - Average execution time
// - Error patterns
```

### 4. Capacity Forecasting
```typescript
// Predict capacity needs:
// - Historical job patterns
// - Seasonal trends
// - Growth projections
```

## Related Documentation

- [Server Module Implementation](./server-module.md)
- [Recurring Jobs with Server URL](./job-execution-with-server-url.md)
- [Scheduler Integration](./server-integration-recurring-jobs.md)

## Conclusion

The date-based server capacity tracking architecture provides:
- ✅ Optimal server utilization
- ✅ Cost efficiency (20× reduction in servers)
- ✅ Flexibility for rescheduling
- ✅ Scalability for growing job volumes
- ✅ Backward compatibility
- ✅ Zero-downtime deployment

This architecture solves the critical problem of server underutilization while maintaining system stability and performance.
