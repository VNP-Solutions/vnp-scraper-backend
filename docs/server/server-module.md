# Server Module Documentation
## Overview
The Server module manages a pool of servers that can be used to distribute and run jobs. Each server has a maximum capacity of 200 jobs. When creating recurring jobs, the system automatically assigns an available server.
## Features
- **Server Management**: Create, read, update, and delete servers
- **Capacity Management**: Track job count per server (max 200 jobs)
- **Auto-assignment**: Automatically find available servers for job distribution
- **Bulk Operations**: Bulk delete multiple servers
- **Status Management**: Activate/deactivate servers
## Database Schema
### Server Model
```prisma
model Server {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  name       String   @unique
  url        String
  job_count  Int      @default(0)
  is_active  Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  jobs Job[]
  @@map("servers")
}
```
### Job Model (Updated)
The `Job` model now includes an optional `server_id` field:
```prisma
model Job {
  // ... other fields
  server_id  String?  @db.ObjectId
  
  server     Server?  @relation(fields: [server_id], references: [id])
  // ...
}
```
## API Endpoints
### 1. Create Server
**Endpoint:** `POST /servers`
**Request Body:**
```json
{
  "name": "Production Server 1",
  "url": "https://server1.example.com",
  "is_active": true
}
```
**Response:**
```json
{
  "statusCode": 201,
  "message": "Server created successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "name": "Production Server 1",
    "url": "https://server1.example.com",
    "job_count": 0,
    "is_active": true,
    "createdAt": "2026-02-09T10:00:00.000Z",
    "updatedAt": "2026-02-09T10:00:00.000Z"
  }
}
```
### 2. Get All Servers
**Endpoint:** `GET /servers`
**Query Parameters:**
- `search` (optional): Search by server name or URL
- `is_active` (optional): Filter by active status (true/false)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `order` (optional): Sort order - asc/desc (default: desc)
**Response:**
```json
{
  "statusCode": 200,
  "message": "Servers retrieved successfully",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "name": "Production Server 1",
      "url": "https://server1.example.com",
      "job_count": 45,
      "is_active": true,
      "createdAt": "2026-02-09T10:00:00.000Z",
      "updatedAt": "2026-02-09T10:00:00.000Z"
    }
  ],
  "metadata": {
    "totalDocuments": 10,
    "currentPage": 1,
    "totalPage": 1,
    "limit": 10
  }
}
```
### 3. Get Available Server
**Endpoint:** `GET /servers/available`
**Description:** Returns an active server with job_count < 200, prioritizing servers with the lowest job count.
**Response:**
```json
{
  "statusCode": 200,
  "message": "Available server retrieved successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "name": "Production Server 1",
    "url": "https://server1.example.com",
    "job_count": 45,
    "is_active": true,
    "createdAt": "2026-02-09T10:00:00.000Z",
    "updatedAt": "2026-02-09T10:00:00.000Z"
  }
}
```
### 4. Get Server by ID
**Endpoint:** `GET /servers/:id`
**Response:**
```json
{
  "statusCode": 200,
  "message": "Server retrieved successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "name": "Production Server 1",
    "url": "https://server1.example.com",
    "job_count": 45,
    "is_active": true,
    "createdAt": "2026-02-09T10:00:00.000Z",
    "updatedAt": "2026-02-09T10:00:00.000Z"
  }
}
```
### 5. Update Server
**Endpoint:** `PUT /servers/:id`
**Request Body:**
```json
{
  "name": "Production Server 1 (Updated)",
  "url": "https://server1-new.example.com",
  "is_active": false
}
```
**Response:**
```json
{
  "statusCode": 200,
  "message": "Server updated successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "name": "Production Server 1 (Updated)",
    "url": "https://server1-new.example.com",
    "job_count": 45,
    "is_active": false,
    "createdAt": "2026-02-09T10:00:00.000Z",
    "updatedAt": "2026-02-09T11:00:00.000Z"
  }
}
```
### 6. Delete Server
**Endpoint:** `DELETE /servers/:id`
**Note:** Cannot delete a server that has active jobs (job_count > 0)
**Response:**
```json
{
  "statusCode": 200,
  "message": "Server deleted successfully",
  "data": {
    "deletedCount": 1,
    "deletedId": "507f1f77bcf86cd799439011"
  }
}
```
### 7. Bulk Delete Servers
**Endpoint:** `POST /servers/bulk-delete`
**Request Body:**
```json
{
  "ids": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
}
```
**Response:**
```json
{
  "statusCode": 200,
  "message": "Successfully deleted 2 server(s)",
  "data": {
    "deletedCount": 2,
    "deletedIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
  }
}
```
## Job Assignment Flow
### When Creating a Recurring Job:
1. System calls `findAvailableServer()` to get a server with capacity < 200
2. Assigns the `server_id` to the job
3. Increments the server's `job_count`
4. When the job runs, it uses the server URL from the assigned server instead of ENV
### When a Job Completes/Fails:
1. System decrements the server's `job_count`
2. Server becomes available for new jobs
## Service Methods
### Server Service
- `createServer(data)`: Create a new server
- `findAllServers(filters)`: Get all servers with pagination and filtering
- `findServerById(id)`: Get a server by ID
- `findAvailableServer()`: Get an available server (active and job_count < 200)
- `updateServer(id, data)`: Update server details
- `deleteServer(id)`: Delete a server (only if job_count = 0)
- `bulkDeleteServers(ids)`: Delete multiple servers
- `incrementJobCount(serverId)`: Increment job count when assigning a job
- `decrementJobCount(serverId)`: Decrement job count when job completes/fails
## Validation Rules
### Create Server:
- `name`: Required, unique, max 100 characters
- `url`: Required, must be a valid URL
- `is_active`: Optional, defaults to true
### Update Server:
- `name`: Optional, unique, max 100 characters
- `url`: Optional, must be a valid URL
- `is_active`: Optional
### Constraints:
- Cannot delete a server with active jobs (job_count > 0)
- Server name must be unique
- Maximum 200 jobs per server
## Error Handling
- **ConflictException (409)**: Server name already exists
- **NotFoundException (404)**: Server not found
- **BadRequestException (400)**: 
  - Server at maximum capacity (200 jobs)
  - Attempting to delete server with active jobs
  - Invalid request data
## Integration with Recurring Jobs
When creating recurring jobs, the system will:
1. Check for available servers using `findAvailableServer()`
2. If an available server is found:
   - Assign `server_id` to the job
   - Increment the server's `job_count`
   - Job will use the server's URL when running
3. If no available server is found:
   - Log a warning
   - Job will be created without a server_id (fallback to ENV URL)
## Migration Needed
After updating the schema, run:
```bash
npx prisma generate
npx prisma db push
```
Or create a migration:
```bash
npx prisma migrate dev --name add_server_model
```
## Usage Examples
### Create a Server
```typescript
const server = await serverService.createServer({
  name: "Production Server 1",
  url: "https://server1.example.com",
  is_active: true
});
```
### Find Available Server for Job Assignment
```typescript
const availableServer = await serverService.findAvailableServer();
if (availableServer) {
  // Assign to job
  job.server_id = availableServer.id;
  await serverService.incrementJobCount(availableServer.id);
}
```
### When Job Completes
```typescript
if (job.server_id) {
  await serverService.decrementJobCount(job.server_id);
}
```
## Notes
- Servers are sorted by `job_count` (ascending) when finding available servers
- Inactive servers are excluded from availability checks
- The system prioritizes servers with the lowest job count for load balancing
- Server URLs should include the full base URL (e.g., `https://server1.example.com`)
