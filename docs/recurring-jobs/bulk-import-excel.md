# Bulk Recurring Job Import from Excel

## Overview
Import multiple recurring jobs from an Excel file with support for historical job creation.

## API Endpoint

```
POST /recurring-jobs/import-excel
```

**Authentication:** Required (JWT)

**Content-Type:** `multipart/form-data`

## Excel File Format

### Required Columns

| Column Name | Type | Description | Example |
|-------------|------|-------------|---------|
| Property Name | String | Name of the property (must exist in database) | `DoubleTree South Charlotte` |
| Posting Type | String | OTA or OTA_PLUS | `OTA` |
| Billing Type | String | VCC, DB, etc. | `VCC` |
| Recurring Date | Date | Schedule date (flexible: M/D/YYYY, MM/DD/YYYY, YYYY-MM-DD, etc.) | `3/15/2026`, `03/15/2026`, or `2026-03-15` |
| Duration | Number | Number of months per bucket (1-12) | `2` |

At least one of these OTA ID columns must be provided:
- **Expedia ID** (Number)
- **Agoda ID** (Number)
- **Booking ID** (Number)

### Optional Columns

| Column Name | Type | Description | Example |
|-------------|------|-------------|---------|
| Portfolio | String | Portfolio name (fetched from property if not provided) | `Crescent Hotels & Resorts` |
| Initial Recurring Date | Date | Initial date for historical jobs (flexible: M/D/YYYY, M/DD/YYYY, MM/D/YYYY, MM/DD/YYYY, YYYY-M-D, YYYY-MM-DD) | `3/5/2026`, `03/05/2026`, `2026-3-5`, or `2026-03-05` |
| Initial Date | Date | Alternative name for Initial Recurring Date | `1/1/2026` |
| Expedia Username | String | Expedia credentials | `user@example.com` |
| Expedia Password | String | Expedia credentials | `password123` |
| Agoda Username | String | Agoda credentials | `user@example.com` |
| Agoda Password | String | Agoda credentials | `password123` |
| Booking Username | String | Booking.com credentials | `user@example.com` |
| Booking Password | String | Booking.com credentials | `password123` |

**Note:** 
- Credentials columns are accepted but not currently used in the recurring job creation logic. They may be used in future enhancements.
- For the initial date, you can use either "Initial Recurring Date" or "Initial Date" - the system will check both.
- If Portfolio or Property don't exist in the database, they will be automatically created.

## How It Works

### OTA Provider Selection
The system automatically determines the OTA provider based on which ID column is filled:
- If `Expedia ID` has a value → OTAProvider = Expedia
- Else if `Agoda ID` has a value → OTAProvider = Agoda
- Else if `Booking ID` has a value → OTAProvider = Booking
- Default → Expedia

### Portfolio Resolution
- If `Portfolio` column is provided, it looks up the portfolio by name
- If `Portfolio` column is empty, it fetches the portfolio from the property
- If property has no portfolio, `portfolio_id` will be null

### Historical Jobs (Initial Date Columns)
If any of these columns are provided: "Initial Recurring Date" or "Initial Date":
- The system treats it as `initial_date`
- Creates jobs for all months from the initial date to `Recurring Date`
- All jobs are scheduled to run on the `Recurring Date`
- Supports flexible date formats: M/D/YYYY, MM/DD/YYYY, or YYYY-MM-DD
- See [Initial Date Feature Documentation](./initial-date-feature.md) for details

If no initial date column is provided:
- Normal recurring job flow (creates one job for the previous month)

## Example Excel File

| Posting Type | Portfolio | Property Name | Expedia ID | Agoda ID | Booking ID | Billing Type | Initial Recurring Date | Recurring Date | Duration |
|--------------|-----------|---------------|------------|----------|------------|--------------|------------------------|----------------|----------|
| OTA | Crescent Hotels | DoubleTree South Charlotte | 12345 | | | VCC | 01/01/2026 | 06/05/2026 | 2 |
| OTA | | Hampton Inn Downtown | | 67890 | | DB | | 03/15/2026 | 1 |
| OTA_PLUS | Marriott Group | Courtyard Atlanta | | | 11223 | VCC | 02/01/2026 | 04/10/2026 | 3 |

## Request Example

```bash
POST /recurring-jobs/import-excel
Content-Type: multipart/form-data
Authorization: Bearer <your-jwt-token>

file: [Excel file binary]
```

## Response Format

### Success Response

```json
{
  "statusCode": 201,
  "message": "Successfully imported 3 recurring job(s)",
  "data": {
    "recurringJobsCreated": 3,
    "recurringJobs": [
      {
        "recurringJob": {
          "id": "67d8e9f0a1b2c3d4e5f6g7h8",
          "name": "DoubleTree South Charlotte - Expedia",
          "schedule_date": "2026-06-05",
          "next_date": "2026-06-05",
          "duration": 2,
          "is_active": true,
          "ota_provider": "Expedia",
          "hotel_id": 12345
        },
        "bucketsCount": 3,
        "jobsCount": 6
      }
    ],
    "errors": []
  }
}
```

### Response With Errors

```json
{
  "statusCode": 201,
  "message": "Successfully imported 2 recurring job(s) with 1 error(s)",
  "data": {
    "recurringJobsCreated": 2,
    "recurringJobs": [ /* ... */ ],
    "errors": [
      {
        "row": 3,
        "error": "Property 'Invalid Property' not found"
      }
    ]
  }
}
```

## Validation Rules

1. **Property Name**: Required. Will be automatically created if it doesn't exist
2. **Portfolio**: Optional. Will be automatically created if it doesn't exist
3. **Recurring Date**: Required, supports flexible date formats (M/D/YYYY, MM/DD/YYYY, YYYY-MM-DD, etc.)
4. **Duration**: Optional, defaults to 1, must be between 1-12
5. **Initial Date**: Optional, supports flexible date formats
6. **OTA IDs**: At least one must be provided (Expedia, Agoda, or Booking ID)
5. **Initial Date**: Optional, supports M/D/YYYY, MM/DD/YYYY, or YYYY-MM-DD format
6. **OTA IDs**: At least one must be provided (Expedia, Agoda, or Booking)

## Error Handling

- Each row is processed independently
- If a row fails, it logs an error but continues processing other rows
- Errors are returned in the response with row numbers
- Successful imports are still created even if some rows fail

## Default Values

If not provided in Excel, the following defaults are used:

| Field | Default Value |
|-------|---------------|
| Job Status | `Pending` |
| Billing Type | `VCC` |
| Posting Type | `OTA` |
| Duration | `1` |
| Execution Type | `scheduled` |
| Max Retries | `3` |
| Retry Delay MS | `5000` |
| Priority | `0` |
| Job Backoff Length Loading | `50000` |
| Job Backoff Length Selector | `40000` |
| Queue Name | `default` |
| Remaining Direct Billed | `0` |
| Total Collectable | `0` |
| Total Amount Confirmed | `0` |

## Use Cases

### Use Case 1: Import New Recurring Jobs
Simply provide Property Name, Recurring Date, Duration, and OTA ID.

### Use Case 2: Import with Historical Data
Include the `Initial Recurring Date` column to create historical jobs.

**Example:**
- Initial Recurring Date: `01/01/2026`
- Recurring Date: `06/05/2026`
- Duration: `2`

This creates:
- 6 historical jobs (Dec 2025 - May 2026)
- Distributed across 3 buckets (2 jobs per bucket)
- All scheduled to run on June 5, 2026

### Use Case 3: Bulk Onboarding
Upload an Excel file with multiple properties to onboard many hotels at once with recurring jobs.

## Related Files

- `src/module/recurring-job/recurring-job.service.ts` - `importRecurringJobsFromExcel()` method
- `src/module/recurring-job/recurring-job.controller.ts` - `POST /recurring-jobs/import-excel` endpoint
- `docs/recurring-jobs/initial-date-feature.md` - Details on historical job creation

## Notes

1. **Duplicate Check**: The system checks for existing recurring jobs with the same name (property_name - ota_provider) before creating
2. **Atomic per Row**: Each row is processed independently - success or failure of one row doesn't affect others
3. **Auto-Create Portfolio & Property**: If portfolio or property don't exist, they will be automatically created
4. **Portfolio Auto-Fetch**: If portfolio is not in Excel, it's automatically fetched from the property
5. **Hotel ID Auto-Select**: The system automatically selects the appropriate hotel_id based on which OTA ID column is filled
6. **Credentials**: While username/password columns are accepted, they're not currently used in recurring job creation
7. **Column Name Flexibility**: The system accepts two column names for the initial date: "Initial Recurring Date" or "Initial Date"
