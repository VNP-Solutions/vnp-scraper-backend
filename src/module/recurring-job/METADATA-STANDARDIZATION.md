# Metadata Structure Standardization

## Overview

Updated the RecurringJob and Bucket APIs to use consistent metadata field names matching the Job API.

## Changes Made

### Before (Inconsistent)

**RecurringJob API:**
```json
{
  "data": [...],
  "metadata": {
    "total": 50,
    "page": 1,
    "totalPages": 5,
    "limit": 10
  }
}
```

**Bucket API:**
```json
{
  "data": [...],
  "metadata": {
    "total": 20,
    "page": 1,
    "totalPages": 2,
    "limit": 10
  }
}
```

**Job API:**
```json
{
  "data": [...],
  "metadata": {
    "totalDocuments": 100,
    "currentPage": 1,
    "totalPage": 10,
    "limit": 10
  }
}
```

### After (Consistent)

**All APIs now return:**
```json
{
  "data": [...],
  "metadata": {
    "totalDocuments": 50,
    "currentPage": 1,
    "totalPage": 5,
    "limit": 10
  }
}
```

## Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `totalDocuments` | number | Total number of records in database |
| `currentPage` | number | Current page number |
| `totalPage` | number | Total number of pages |
| `limit` | number | Number of items per page |

## Affected Endpoints

### 1. GET /recurring-jobs

**Request:**
```bash
GET /recurring-jobs?page=2&limit=10
```

**Response:**
```json
{
  "statusCode": 200,
  "message": "Recurring jobs retrieved successfully",
  "data": [...],
  "metadata": {
    "totalDocuments": 50,
    "currentPage": 2,
    "totalPage": 5,
    "limit": 10
  }
}
```

### 2. GET /recurring-jobs/:id/buckets

**Request:**
```bash
GET /recurring-jobs/507f1f77bcf86cd799439010/buckets?page=1&limit=5
```

**Response:**
```json
{
  "statusCode": 200,
  "message": "Buckets retrieved successfully",
  "data": [...],
  "metadata": {
    "totalDocuments": 15,
    "currentPage": 1,
    "totalPage": 3,
    "limit": 5
  }
}
```

## Benefits

### ✅ Consistency
- All GET APIs return the same metadata structure
- Frontend can use the same parsing logic for all APIs
- Reduces confusion and bugs

### ✅ Clarity
- `totalDocuments` is clearer than `total`
- `currentPage` is clearer than `page`
- `totalPage` matches Job API convention

### ✅ Maintainability
- Easier to write reusable pagination components
- Consistent naming across the entire codebase
- Standard pattern for future APIs

## Migration Guide

If you have frontend code using the old field names, update them:

```typescript
// Before
const { total, page, totalPages, limit } = response.metadata;

// After
const { totalDocuments, currentPage, totalPage, limit } = response.metadata;
```

## Files Modified

- ✅ `src/module/recurring-job/recurring-job.repository.ts` - Updated findAll metadata
- ✅ `src/module/recurring-job/recurring-job.service.ts` - Updated getBucketsByRecurringId metadata

## Testing

Verify the metadata structure in responses:

```bash
# Test Recurring Jobs
curl -X GET "http://localhost:3000/api/recurring-jobs?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test Buckets
curl -X GET "http://localhost:3000/api/recurring-jobs/RECURRING_JOB_ID/buckets?page=1&limit=5" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected metadata:
```json
{
  "totalDocuments": 50,
  "currentPage": 1,
  "totalPage": 5,
  "limit": 10
}
```

## Summary

All GET APIs now use consistent metadata field names:
- `totalDocuments` (was `total`)
- `currentPage` (was `page`)
- `totalPage` (was `totalPages`)
- `limit` (unchanged)

This matches the Job API convention and provides a consistent experience across the entire application!
