# Appeal ID System - Testing Guide

## Overview

This guide provides comprehensive testing procedures for the Appeal ID system and related features.

---

## Unit Tests

### Running Unit Tests

```bash
# Run all tests
npm run test

# Run only appeal-id tests
npm run test -- appeal-id.test.ts

# Run with coverage
npm run test -- --coverage

# Run in watch mode
npm run test -- --watch
```

### Test Coverage

Current test file: `__tests__/appeal-id.test.ts`

Tests included:
- ✅ ID generation (8-digit format)
- ✅ ID range validation (10M-99M)
- ✅ Uniqueness across multiple generations
- ✅ Formatting (XXXX-XXXX)
- ✅ Unformatting (XXXX-XXXX → XXXXXXXX)
- ✅ Round-trip conversion
- ✅ Edge cases (boundary values, special characters)

---

## Integration Tests

### Test Database Setup

```bash
# Create test database
createdb myunion_pro_test

# Run migrations on test DB
DATABASE_URL="postgresql://user:pass@localhost:5432/myunion_pro_test" \
  npx prisma migrate deploy

# Seed with test data (optional)
npm run seed:test
```

### API Testing

#### 1. Create Appeal

**Endpoint**: `POST /api/appeals`

**Test Script**:
```bash
#!/bin/bash

# Set test variables
API_URL="http://localhost:3004"
SESSION_COOKIE="your_session_cookie_here"

# Create appeal
RESPONSE=$(curl -X POST "$API_URL/api/appeals" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=$SESSION_COOKIE" \
  -d '{
    "type": "LEGAL",
    "title": "Test Appeal",
    "description": "This is a test appeal"
  }')

echo "$RESPONSE" | jq '.'

# Extract publicId
PUBLIC_ID=$(echo "$RESPONSE" | jq -r '.appeal.publicId')
echo "Created appeal with ID: $PUBLIC_ID"
```

**Expected Response**:
```json
{
  "success": true,
  "appeal": {
    "id": "clh123...",
    "publicId": "12345678",
    "type": "LEGAL",
    "status": "PENDING",
    "title": "Test Appeal",
    "description": "This is a test appeal",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### 2. Get Appeals

**Endpoint**: `GET /api/appeals`

**Test Script**:
```bash
curl -X GET "http://localhost:3004/api/appeals" \
  -H "Cookie: next-auth.session-token=$SESSION_COOKIE" | jq '.'
```

**Expected Response**:
```json
{
  "success": true,
  "appeals": [
    {
      "id": "clh123...",
      "publicId": "12345678",
      "type": "LEGAL",
      "status": "PENDING",
      "title": "Test Appeal",
      "description": "This is a test appeal",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z",
      "messageCount": 0,
      "lastMessage": null
    }
  ]
}
```

#### 3. Delete Appeal

**Endpoint**: `DELETE /api/appeals/[id]`

**Test Script**:
```bash
APPEAL_ID="clh123..."
curl -X DELETE "http://localhost:3004/api/appeals/$APPEAL_ID" \
  -H "Cookie: next-auth.session-token=$SESSION_COOKIE" | jq '.'
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Appeal deleted successfully"
}
```

---

## UI Testing

### Sidebar Display

**Test Cases**:

1. **Expand Appeals Menu**
   - [ ] Click "Обращения" button
   - [ ] Menu expands smoothly
   - [ ] Shows loading state initially
   - [ ] Lists all user appeals

2. **Display Format**
   - [ ] Each appeal shows type emoji
   - [ ] Public ID displays as "XXXX-XXXX"
   - [ ] Status shows with color indicator
   - [ ] Hover shows three-dot menu

3. **Click Appeal**
   - [ ] Click appeal item
   - [ ] Navigates to appeal details
   - [ ] URL changes to `/dashboard/appeals/[id]`

4. **Delete Appeal**
   - [ ] Click three-dot menu
   - [ ] Shows delete option
   - [ ] Confirm dialog appears
   - [ ] Appeal removed from list
   - [ ] Appeal removed from database

### Appeals Page Display

**Test Cases**:

1. **Page Load**
   - [ ] Page loads without errors
   - [ ] Shows loading spinner initially
   - [ ] Appeals load and display

2. **Appeal Card Display**
   - [ ] Shows appeal title
   - [ ] Shows public ID with purple badge
   - [ ] Shows type and status
   - [ ] Shows creation date
   - [ ] Shows message count

3. **Filtering**
   - [ ] Click "Все" shows all appeals
   - [ ] Click status filters correctly
   - [ ] Multiple appeals visible if they exist

4. **Empty State**
   - [ ] Shows message when no appeals
   - [ ] Provides helpful hint

---

## Database Testing

### Verify Schema Changes

```sql
-- Connect to database
psql $DATABASE_URL

-- Check publicId column exists
\d "UserAppeal"

-- Should show:
-- publicId | character(8) | not null

-- Check constraints
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'UserAppeal';

-- Check indexes
SELECT indexname FROM pg_indexes 
WHERE tablename = 'UserAppeal';
```

### Test Data Integrity

```sql
-- Verify all appeals have publicId
SELECT COUNT(*) as total,
       COUNT(CASE WHEN "publicId" IS NULL THEN 1 END) as nulls
FROM "UserAppeal";

-- Should show: total = X, nulls = 0

-- Check for duplicates
SELECT "publicId", COUNT(*) as count
FROM "UserAppeal"
GROUP BY "publicId"
HAVING COUNT(*) > 1;

-- Should return: (empty)

-- Verify ID format (8 digits)
SELECT "publicId", LENGTH("publicId")
FROM "UserAppeal"
WHERE LENGTH("publicId") != 8 OR "publicId" !~ '^\d{8}$'
LIMIT 10;

-- Should return: (empty)
```

### Performance Testing

```sql
-- Test index performance
EXPLAIN ANALYZE 
SELECT * FROM "UserAppeal" 
WHERE "publicId" = '12345678';

-- Should show "Index Scan" using "UserAppeal_publicId_idx"

-- Measure query time
\timing on

SELECT * FROM "UserAppeal" 
WHERE "publicId" = '12345678';

-- Should complete in < 1ms

-- Test with 100k records simulation
-- Create test data
INSERT INTO "UserAppeal" 
  ("userId", "publicId", "type", "status", "title", "description", "question")
SELECT 
  gen_random_uuid()::text,
  LPAD(floor(random() * 90000000 + 10000000)::text, 8, '0'),
  'LEGAL',
  'PENDING',
  'Test Appeal ' || generate_series(1, 1000),
  'Description',
  'Question'
FROM generate_series(1, 1000);

-- Benchmark query again
EXPLAIN ANALYZE 
SELECT * FROM "UserAppeal" WHERE "publicId" = '12345678';
```

---

## End-to-End Testing

### Complete User Flow

**Prerequisites**:
- Development server running
- User logged in
- Test database populated

**Test Steps**:

1. **Create Appeal**
   - Navigate to `/dashboard/appeals`
   - Create new appeal via API or UI
   - Verify public ID is generated (8 digits)
   - Verify appears in sidebar

2. **View Appeal Details**
   - Click appeal in sidebar
   - Verify public ID displays
   - Verify type, status, dates display
   - Verify message count

3. **Manage Appeal**
   - Delete appeal via three-dot menu
   - Confirm deletion from sidebar
   - Verify database is updated

4. **Multiple Appeals**
   - Create 5+ different appeals
   - Verify all display in sidebar
   - Verify all have unique IDs
   - Verify filtering works

5. **Permissions**
   - Create appeal as User A
   - Try to delete as User B (should fail)
   - Verify only owner can delete

---

## Performance Benchmarks

Expected performance metrics:

| Operation | Expected Time | Tool |
|-----------|---------------|------|
| Generate ID | < 1ms | Unit test |
| Format ID | < 1ms | Unit test |
| Create appeal | 50-100ms | Integration test |
| Get appeals | 10-50ms | Integration test |
| Delete appeal | 50-100ms | Integration test |
| Query by public ID | < 1ms | DB test |
| List all appeals | 10-50ms | DB test |

**Test with**:
```bash
# Use Apache Bench for load testing
ab -n 1000 -c 10 http://localhost:3004/api/appeals

# Use hey for HTTP benchmarking
go install github.com/rakyll/hey@latest
hey -n 1000 -c 10 http://localhost:3004/api/appeals
```

---

## Security Testing

### Authorization Tests

```bash
# Test without authentication
curl -X GET "http://localhost:3004/api/appeals" \
  -H "Content-Type: application/json"
# Should return: 401 Unauthorized

# Test with invalid session
curl -X GET "http://localhost:3004/api/appeals" \
  -H "Cookie: next-auth.session-token=invalid_token"
# Should return: 401 Unauthorized
```

### Input Validation

```bash
# Test invalid appeal type
curl -X POST "http://localhost:3004/api/appeals" \
  -H "Content-Type: application/json" \
  -d '{"type": "INVALID", "title": "Test"}'
# Should return: 400 Bad Request

# Test empty title
curl -X POST "http://localhost:3004/api/appeals" \
  -H "Content-Type: application/json" \
  -d '{"type": "LEGAL", "title": ""}'
# Should return: 400 Bad Request

# Test SQL injection in title
curl -X POST "http://localhost:3004/api/appeals" \
  -H "Content-Type: application/json" \
  -d '{"type": "LEGAL", "title": "'; DROP TABLE UserAppeal; --"}'
# Should be sanitized and rejected
```

### ID Collision Testing

```bash
# Generate 10,000 IDs and check for collisions
node -e "
const { generateAppealPublicId } = require('./lib/appeal-id.ts');
const ids = new Set();
const duplicates = [];

for (let i = 0; i < 10000; i++) {
  const id = generateAppealPublicId();
  if (ids.has(id)) {
    duplicates.push(id);
  }
  ids.add(id);
}

console.log('Total IDs generated:', 10000);
console.log('Unique IDs:', ids.size);
console.log('Collisions:', duplicates.length);
console.log('Collision rate:', (duplicates.length / 10000 * 100).toFixed(4) + '%');
"
```

---

## Regression Testing

After deploying changes, verify:

- [ ] Existing appeals still have their IDs
- [ ] Can still create new appeals
- [ ] Sidebar displays appeals correctly
- [ ] Delete functionality works
- [ ] No database errors in logs
- [ ] API response times acceptable
- [ ] All previous features still work

---

## Bug Report Template

When filing bugs, include:

```markdown
## Summary
Brief description of the issue

## Steps to Reproduce
1. Navigate to...
2. Click...
3. Expected: ...
4. Actual: ...

## Environment
- OS: macOS/Linux/Windows
- Browser: Chrome/Safari/Firefox
- Database: PostgreSQL X.X
- Node: X.X.X

## Attachments
- Screenshots
- Error logs
- Video if applicable

## Impact
- Severity: Critical/High/Medium/Low
- Affects: Sidebar/API/Database/etc
```

---

## Continuous Integration

### GitHub Actions Workflow

```yaml
name: Test Appeal System

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm run test
      - run: npm run test:integration
      - run: npm run lint
```

---

**Last Updated**: 2024-01-15
**Test Coverage**: 85%+ (target)

