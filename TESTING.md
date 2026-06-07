# Testing Guide

Comprehensive testing procedures for the Friends and Family Financing Portal.

## Table of Contents

1. [Manual Testing](#manual-testing)
2. [Automated Testing](#automated-testing)
3. [Integration Testing](#integration-testing)
4. [Security Testing](#security-testing)
5. [Performance Testing](#performance-testing)

## Manual Testing

### 1. Local Environment Setup

Verify your local environment is properly configured:

```bash
# Check Node.js version
node --version  # Should be 20+

# Check npm version
npm --version   # Should be 10+

# Verify database is running
docker-compose ps
# Should show postgres running

# Check environment variables
cat .env.local
# Should have DATABASE_URL and NEXT_PUBLIC_APP_URL
```

### 2. Authentication Flow

**Test Login:**

1. Navigate to http://localhost:3000/login
2. Enter email: `owner@example.com`
3. Enter password: `OwnerDemo123!`
4. Click "Login"
5. **Expected**: Redirected to `/portal/setup`
6. **Verify**: Session cookie set:
   ```javascript
   // In browser console
   document.cookie  // Should contain "ffp_session_user"
   ```

**Test Failed Login:**

1. Same URL, enter wrong password
2. **Expected**: Error message appears
3. **Verify**: After 5 attempts, account blocked for 15 minutes

**Test Logout:**

1. Click "Logout" button
2. **Expected**: Redirected to `/login`
3. **Verify**: Session cookie cleared

**Test Protected Routes:**

1. Clear cookies: `document.cookie = "ffp_session_user=;"`
2. Navigate to http://localhost:3000/portal/setup
3. **Expected**: Redirected to `/login`

### 3. Setup Wizard Flow

**Test Partnership Initialization:**

1. Login with `owner@example.com`
2. Fill out setup form:
   - Partnership Name: "Test Partnership"
   - Base Currency: "USD"
   - Members: Add partner with email
3. Submit form
4. **Expected**: JSON response showing created partnership, users, property
5. **Verify**: 
   - Partnership created in database
   - Both users have hashed passwords (not plain text)
   - Ownership snapshots initialized

**Test Validation:**

1. Submit form with:
   - Empty partnership name
   - Invalid email format
   - Negative initial valuation
2. **Expected**: Validation errors displayed for each field

### 4. Monthly Payment Entry

**Test Payment Preview:**

1. Navigate to `/portal/monthly`
2. Enter payment month: `2024-06`
3. Enter payment amount: `2000`
4. Click "Preview"
5. **Expected**: Shows breakdown:
   - Rent applied: `$1200` (agreed amount)
   - Tax reimbursement: `$200`
   - Purchase amount: `$600`
   - New ownership: Updated percentages
6. **Verify**: Math is correct

**Test Payment Posting:**

1. After preview, click "Post Payment"
2. **Expected**: Success message, returned to ledger
3. **Verify**: New payment appears in ledger
4. Check database:
   ```sql
   SELECT * FROM "MonthlyPayment" ORDER BY "createdAt" DESC LIMIT 1;
   SELECT * FROM "MonthlyPaymentAllocation";
   SELECT * FROM "OwnershipSnapshot" ORDER BY "effectiveMonth" DESC;
   SELECT * FROM "AuditLog" ORDER BY "createdAt" DESC;
   ```

**Test Duplicate Prevention:**

1. Try posting same month twice
2. **Expected**: Error (month already posted)

### 5. Ledger Viewing

**Test Ledger Display:**

1. Navigate to `/portal/ledger`
2. **Expected**: Displays:
   - All posted monthly payments
   - Per-member rent allocations
   - Tax breakdowns
   - Ownership percentages over time

**Test Date Filtering:**

1. Add date range filter: `2024-01 to 2024-06`
2. **Expected**: Ledger filtered to this range

**Test Ownership Timeline:**

1. Scroll down to "Ownership Timeline"
2. **Expected**: Shows monthly ownership percentages

### 6. Projections

**Test Buyout Projection:**

1. On ledger page, click "Run Projection"
2. Enter monthly payment: `2000`
3. Enter start month: `2024-07`
4. Click "Calculate"
5. **Expected**: Shows:
   - Months until occupant owns 100%
   - Total partner dividends
   - Month-by-month ownership timeline

**Test Exports:**

1. Click "Export Ledger (CSV)"
   - **Expected**: Downloads CSV with all payments
2. Click "Export Projection (CSV)"
   - **Expected**: Downloads CSV with timeline
3. Click "Export Projection (PDF)"
   - **Expected**: Downloads PDF with formatted projection

### 7. Data Persistence

**Test Persistence:**

1. Post a payment
2. Refresh page (`F5`)
3. **Expected**: Data still visible
4. Close browser
5. Reopen and login
6. **Expected**: Data persists in ledger

**Test Audit Trail:**

```sql
SELECT * FROM "AuditLog" 
ORDER BY "createdAt" DESC 
LIMIT 5;

-- Should show all operations with actor, timestamp, before/after state
```

## Automated Testing

### Static Analysis

**ESLint:**
```bash
npm run lint
# Expected: ✓ 0 errors, 0 warnings
```

**TypeScript Compiler:**
```bash
npx tsc --noEmit
# Expected: (no output = no errors)
```

### Build Verification

```bash
npm run build
# Expected: ✓ Compiled successfully
# Check:
# - No errors in .next/
# - No warnings
# - next.config.ts applied correctly
```

### Database Validation

```bash
# Verify schema is in sync
npm run db:push -- --dry-run
# Expected: No pending migrations

# Verify seed script runs
npm run db:seed
# Expected: Demo data inserted successfully
```

## Integration Testing

### Full User Journey

**Scenario: New Partnership Setup → Monthly Posting → Projection**

```bash
# 1. Start fresh (optional reset)
npm run db:seed  # Reset with demo data

# 2. Login
curl -c cookies.txt \
  -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"OwnerDemo123!"}'

# 3. Preview payment
curl -b cookies.txt \
  -X POST http://localhost:3000/api/monthly-payments/preview \
  -H "Content-Type: application/json" \
  -d '{
    "partnershipId":"<id>",
    "paymentMonth":"2024-06",
    "totalPaid":2000,
    "paidBy":"<member-id>"
  }'

# 4. Post payment
curl -b cookies.txt \
  -X POST http://localhost:3000/api/monthly-payments \
  -H "Content-Type: application/json" \
  -d '{...}' > payment_response.json

# 5. Get ledger
curl -b cookies.txt \
  http://localhost:3000/api/ledger/<partnership-id>

# 6. Run projection
curl -b cookies.txt \
  -X POST http://localhost:3000/api/projections/estimate \
  -H "Content-Type: application/json" \
  -d '{...}'
```

### API Contract Testing

**Test all endpoints return correct status codes:**

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/auth/login` | POST | 200/401 | Valid/invalid creds |
| `/api/auth/logout` | POST | 200 | Always succeeds |
| `/api/auth/session` | GET | 200 | Returns auth status |
| `/api/monthly-payments` | POST | 201/400 | Created or validation error |
| `/api/monthly-payments/preview` | POST | 200/400 | Preview or error |
| `/api/ledger/:id` | GET | 200/403 | Ledger or unauthorized |
| `/api/projections/estimate` | POST | 200/400 | Projection or error |
| `/api/health` | GET | 200 | Always healthy |

## Security Testing

### Authentication Security

**Test Session Fixation Protection:**

```bash
# 1. Get a session
curl -i http://localhost:3000/login
# Note Set-Cookie header

# 2. Try to use that cookie on different domain (if applicable)
# Should fail or require re-auth
```

**Test Password Strength:**

```bash
# Test weak passwords
WEAK_PASSWORDS=(
  "123456"          # Too simple
  "Test123"         # No special char
  "Test!@#$"        # No number
  "test1234"        # No uppercase
)

for pwd in "${WEAK_PASSWORDS[@]}"; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"test@example.com\",\"password\":\"$pwd\"}"
done
# Expected: All rejected
```

**Test SQL Injection:**

```bash
# Try SQL injection in login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin\"; DROP TABLE users; --","password":"test"}'
# Expected: Normal validation error (query parameter)
```

### CSRF Protection

**Test Cross-Site Request Forgery Prevention:**

```bash
# Verify CSRF headers present
curl -i http://localhost:3000/portal/setup
# Expected: Content-Security-Policy header

# Verify secure cookie flags
curl -i http://localhost:3000/api/auth/login
# Expected: Set-Cookie with HttpOnly, SameSite flags
```

### XSS Protection

**Test XSS Prevention:**

```bash
# Try XSS in form fields
curl -X POST http://localhost:3000/api/setup/initialize \
  -H "Content-Type: application/json" \
  -d '{
    "partnershipName":"<script>alert(1)</script>",
    ...
  }'
# Expected: Escaping/validation error
```

### Rate Limiting

**Test Login Rate Limiting:**

```bash
# Make 6 rapid login attempts
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"user@example.com","password":"wrong"}'
done
# Expected: 
# - First 5: 401 Unauthorized
# - 6th: 429 Too Many Requests with Retry-After header
```

### Security Headers

**Verify all security headers present:**

```bash
curl -i http://localhost:3000

# Expected headers:
# - X-Frame-Options: DENY
# - X-Content-Type-Options: nosniff
# - X-XSS-Protection: 1; mode=block
# - Content-Security-Policy: ...
# - Referrer-Policy: strict-origin-when-cross-origin
# - Permissions-Policy: ...
```

## Performance Testing

### Load Testing

**Test with Apache Bench:**

```bash
# Warm up
ab -n 10 -c 1 http://localhost:3000/

# Light load (100 requests, 5 concurrent)
ab -n 100 -c 5 http://localhost:3000/

# Medium load (1000 requests, 50 concurrent)
ab -n 1000 -c 50 http://localhost:3000/

# Expected:
# - Response time < 100ms median
# - 0% error rate
# - Handle concurrent requests
```

**Test with Autocannon:**

```bash
npm install -g autocannon

# 10 second load test
autocannon -d 10 -c 50 -p 10 http://localhost:3000/
```

### Database Performance

**Test query performance:**

```sql
-- Ledger query (common operation)
EXPLAIN ANALYZE
SELECT * FROM "MonthlyPayment" 
WHERE "partnershipId" = 'uuid'
ORDER BY "paymentMonth" DESC;
-- Expected: < 1ms with index

-- Ownership snapshot query
EXPLAIN ANALYZE
SELECT * FROM "OwnershipSnapshot"
WHERE "partnershipId" = 'uuid'
AND "effectiveMonth" <= '2024-06'
ORDER BY "effectiveMonth" DESC
LIMIT 1;
-- Expected: < 1ms with index
```

### Memory Usage

**Monitor memory while running:**

```bash
# In one terminal
npm run dev

# In another terminal
watch -n 1 'node -e "console.log(process.memoryUsage())"'
```

### Bundle Size

```bash
npm run build

# Check generated bundle
du -h .next/

# Check specific page bundle sizes
ls -lh .next/static/chunks/
```

## Continuous Integration Checklist

Before committing, verify:

- [ ] `npm run lint` passes with 0 errors
- [ ] `npm run build` succeeds
- [ ] All TypeScript types valid
- [ ] Database migrations apply cleanly
- [ ] No console errors in dev mode
- [ ] All routes accessible
- [ ] Session management working
- [ ] Audit logs recording changes
- [ ] No sensitive data in logs/responses

## Test Scenarios Documentation

### Scenario 1: Simple 50/50 Partnership

**Setup:**
- Partnership: "Test 50/50"
- Property value: $400,000
- Partner A (owner): $200,000 investment (50%)
- Partner B (occupant): $200,000 investment (50%)
- Agreed rent: $1,500/month
- No tax reimbursements

**Monthly Payment ($2,000):**
- Rent allocation: $1,500 (split $750 each)
- Extra: $500 → Partner A owns more, new ownership 55%/45%

### Scenario 2: Complex Multi-Member Partnership

**Setup:**
- Partnership: "Complex"
- 3 members with unequal ownership
- Multiple tax reimbursement schedules
- Property valuation changes monthly

**Expected Results:**
- Correct rent splitting by member count
- Tax reimbursements applied in order
- Ownership percentages sum to 100%
- Audit trail captures all changes

---

For questions about testing, refer to ARCHITECTURE.md or contact the development team.
