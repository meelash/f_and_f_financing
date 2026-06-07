# Troubleshooting Guide

Common issues and solutions for the Friends and Family Financing Portal.

## Database Connection Issues

### Error: "connect ECONNREFUSED 127.0.0.1:5432"

**Cause:** PostgreSQL is not running or not accessible at the configured address.

**Solution:**

```bash
# Check if Docker container is running
docker-compose ps

# If not running, start it
docker-compose up -d

# Verify it's healthy
docker-compose logs postgres
# Should show "database system is ready to accept connections"

# Test connection directly
psql postgresql://ffp_dev:ffp_dev_password@localhost:5432/ffp_db
# Should connect successfully
```

### Error: "password authentication failed for user 'ffp_dev'"

**Cause:** Wrong database credentials.

**Solution:**

```bash
# Verify DATABASE_URL in .env.local
cat .env.local | grep DATABASE_URL

# Should be:
# DATABASE_URL="postgresql://ffp_dev:ffp_dev_password@localhost:5432/ffp_db"

# For remote databases, verify credentials with provider
# (Neon, Supabase, AWS RDS, etc.)
```

### Error: "could not translate host name ... to address"

**Cause:** Database host is unreachable or DNS not resolving.

**Solution:**

```bash
# Test DNS resolution
ping postgres  # If using Docker Compose service name
ping localhost

# For remote databases, verify hostname
# Check if behind VPN/firewall that blocks connections

# Verify network connectivity
telnet your-database-host.com 5432
# Should connect (or show "Escape character is '^]'")
```

### Error: "FATAL: database 'ffp_db' does not exist"

**Cause:** Database not created yet.

**Solution:**

```bash
# Create database
npm run db:push

# If that fails, create manually:
psql -U ffp_dev -h localhost -c "CREATE DATABASE ffp_db"

# Then run migrations
npm run db:push
```

## Authentication & Login Issues

### Error: "Email is not registered" or "Invalid credentials"

**Cause:** User doesn't exist or password is wrong.

**Solution:**

```bash
# Verify demo user was seeded
npm run db:seed

# Check if user exists in database
psql postgresql://ffp_dev:ffp_dev_password@localhost:5432/ffp_db
> SELECT email, fullName FROM "User" LIMIT 5;

# Should show:
# owner@example.com
# partner@example.com

# Verify correct demo passwords:
# Owner: OwnerDemo123!
# Partner: PartnerDemo123!
```

### Error: "Account locked due to too many failed attempts"

**Cause:** Too many failed login attempts triggered rate limiting.

**Solution:**

```bash
# Wait 15 minutes for automatic unlock

# OR clear rate limit manually (in-memory, resets on server restart)
npm run dev  # Restart development server

# In production, rate limit data is stored in memory
# Restart the application to reset
```

### Error: "Session cookie not persisting" or "Keep getting logged out"

**Cause:** Cookie settings mismatch between environment and browser.

**Solution:**

**For local development (HTTP):**
```bash
# In .env.local
NEXT_PUBLIC_SECURE_COOKIES=false
NODE_ENV=development
```

**For production (HTTPS):**
```bash
# In .env.production
NEXT_PUBLIC_SECURE_COOKIES=true
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

**Also check:**
```bash
# Clear browser cookies and retry
# Settings → Privacy → Cookies → ffp_session_user

# Or clear all site data
# In DevTools: Application → Storage → Clear site data
```

## Build & Compilation Issues

### Error: "npm ERR! code ERESOLVE, npm ERR! ERESOLVE unable to resolve dependency tree"

**Cause:** NPM dependency conflict.

**Solution:**

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# If still failing, use legacy peer deps (not recommended)
npm install --legacy-peer-deps
```

### Error: TypeScript compilation errors

**Cause:** Type mismatches or missing types.

**Solution:**

```bash
# Run type checker
npx tsc --noEmit

# Fix errors one by one, or
# Check if types need to be installed
npm install -D @types/node-whatever

# Regenerate Prisma types
npm run db:generate
```

### Error: "Module not found: Can't resolve '@/...' "

**Cause:** Path alias not configured or wrong import path.

**Solution:**

```bash
# Check tsconfig.json has proper baseUrl and paths
cat tsconfig.json

# Should have:
# "baseUrl": ".",
# "paths": {
#   "@/*": ["./src/*"]
# }

# Verify file exists at that path
# Then restart dev server
npm run dev
```

### Error: "Cannot find module 'next/server'" or other Next.js modules

**Cause:** Next.js not installed or wrong version.

**Solution:**

```bash
npm install next@latest
npm install
npm run build
```

## API & Endpoint Issues

### Error: "401 Unauthorized" on protected routes

**Cause:** No valid session cookie.

**Solution:**

```bash
# Login first
curl -c cookies.txt \
  -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"OwnerDemo123!"}'

# Use cookies in subsequent requests
curl -b cookies.txt http://localhost:3000/api/ledger/...
```

### Error: "403 Forbidden" or "User not in partnership"

**Cause:** User doesn't have access to that partnership.

**Solution:**

```bash
# Verify user is member of partnership
SELECT * FROM "PartnershipMembership" 
WHERE "userId" = 'your-user-id' AND "partnershipId" = 'partnership-id';

# If not found, add user to partnership
# Or login as admin user
```

### Error: "404 Not Found" for ledger/projections

**Cause:** Partnership ID is wrong or doesn't exist.

**Solution:**

```bash
# Get correct partnership ID
SELECT id, name FROM "Partnership" LIMIT 1;

# Use that ID in requests
curl http://localhost:3000/api/ledger/correct-partnership-id
```

### Error: "400 Bad Request" on POST endpoints

**Cause:** Invalid request body or missing required fields.

**Solution:**

```bash
# Check error response for details
curl -X POST http://localhost:3000/api/monthly-payments/preview \
  -H "Content-Type: application/json" \
  -d '{
    "partnershipId": "uuid",
    "paymentMonth": "2024-06",
    "totalPaid": 2000,
    "paidBy": "member-id"
  }'

# Response should show which fields are invalid
# Verify:
# - partnershipId is valid UUID format
# - paymentMonth is YYYY-MM format
# - totalPaid is positive number
# - paidBy is valid member ID
```

## Data & Calculations Issues

### Payment not appearing in ledger

**Cause:** Payment didn't post successfully.

**Solution:**

```bash
# Check database directly
SELECT * FROM "MonthlyPayment" 
WHERE "partnershipId" = 'your-id'
ORDER BY "createdAt" DESC;

# If no results, payment wasn't created

# Check for errors in:
# - Browser console (DevTools → Console)
# - Server logs (terminal where `npm run dev` is running)
# - Database constraints violated
```

### Ownership percentages not adding to 100%

**Cause:** Calculation error or database inconsistency.

**Solution:**

```sql
-- Check current ownership
SELECT "memberId", "ownershipPercentage" 
FROM "OwnershipSnapshot" 
WHERE "partnershipId" = 'your-id'
AND "effectiveMonth" = '2024-06'
GROUP BY "memberId";

-- Sum should equal 100
SELECT SUM("ownershipPercentage") FROM "OwnershipSnapshot" 
WHERE "partnershipId" = 'your-id'
AND "effectiveMonth" = '2024-06';

-- If not 100%, there's a data issue
-- Review allocation logic and repost if needed
```

### Projection shows wrong buyout timeline

**Cause:** Calculation using wrong ownership/payment data.

**Solution:**

```bash
# Verify input parameters
# - Monthly payment amount
# - Starting ownership percentages
# - Agreed rent policy

# Run projection manually to debug
curl -X POST http://localhost:3000/api/projections/estimate \
  -H "Content-Type: application/json" \
  -d '{
    "partnershipId": "...",
    "monthlyPayment": 2000,
    "startMonth": "2024-07"
  }'

# Check response includes month-by-month breakdown
# Verify ownership increases each month
```

## Performance Issues

### Application is slow or unresponsive

**Cause:** Database queries are slow, server is overloaded, or memory is running out.

**Solution:**

```bash
# Check server logs
tail -f .next/server.log  # If logging is configured

# Check database query performance
psql postgresql://ffp_dev:ffp_dev_password@localhost:5432/ffp_db

# Enable query logging
ALTER DATABASE ffp_db SET log_statement = 'all';
ALTER DATABASE ffp_db SET log_duration = on;

# Check system resources
top  # Monitor CPU and memory usage

# Kill heavy processes if needed
kill -9 <pid>
```

### Database is running out of disk space

**Cause:** Old backups, log files, or large data.

**Solution:**

```bash
# Check disk usage
du -sh *  # In database data directory

# Clean old backups
find /backups -name "*.sql.gz" -mtime +30 -delete

# Vacuum database (remove dead tuples)
psql -U ffp_dev -d ffp_db -c "VACUUM ANALYZE;"

# Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
FROM pg_tables 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### API responses are timing out

**Cause:** Long-running queries, many records, or slow network.

**Solution:**

```bash
# Add pagination/filtering
# Instead of querying all records, add date range:
GET /api/ledger/id?from=2024-01&to=2024-06

# Check if missing indexes
EXPLAIN ANALYZE SELECT * FROM "MonthlyPayment" 
WHERE "partnershipId" = 'uuid'
ORDER BY "paymentMonth" DESC;

# If "Seq Scan", an index is missing
CREATE INDEX idx_monthly_payment_partnership 
ON "MonthlyPayment"("partnershipId", "paymentMonth" DESC);
```

## Docker & Deployment Issues

### Error: "Docker daemon is not running"

**Cause:** Docker service not started.

**Solution:**

```bash
# Start Docker daemon
# On Mac: Open Docker Desktop app
# On Linux: 
sudo systemctl start docker

# Verify it's running
docker ps
```

### Error: "docker-compose command not found"

**Cause:** Docker Compose not installed.

**Solution:**

```bash
# Install Docker Compose V2
docker compose version  # Check if V2 is available

# Or install separately
pip install docker-compose

# Use newer syntax (V2)
docker compose up -d  # Instead of docker-compose up -d
```

### Docker container exits immediately

**Cause:** Application error during startup.

**Solution:**

```bash
# Check logs
docker logs ffp-app

# Common causes:
# - DATABASE_URL not set
# - Database not reachable
# - Node.js process crashed

# If rebuild needed
docker build -t f-and-f-financing .
docker run ... f-and-f-financing

# Keep container running for debugging
docker run -it f-and-f-financing /bin/sh
```

## Environment Variable Issues

### Error: "Missing required environment variable: DATABASE_URL"

**Cause:** Environment variable not set.

**Solution:**

```bash
# Create .env.local file
cp .env.example .env.local

# Edit and set DATABASE_URL
# For local Docker:
DATABASE_URL="postgresql://ffp_dev:ffp_dev_password@localhost:5432/ffp_db"

# Verify it's read
cat .env.local

# Restart dev server
npm run dev
```

### Error: "Invalid NEXT_PUBLIC_APP_URL"

**Cause:** App URL not a valid URL format.

**Solution:**

```bash
# Must include protocol (http or https)
NEXT_PUBLIC_APP_URL="http://localhost:3000"  # ✓ Correct
NEXT_PUBLIC_APP_URL="localhost:3000"         # ✗ Wrong

# Production must use HTTPS
NEXT_PUBLIC_APP_URL="https://your-domain.com"
```

## How to Get Help

If you can't resolve an issue:

1. **Check the logs:**
   ```bash
   # Server logs
   tail -100 .next/build.log
   
   # Database logs
   docker logs ffp-postgres-dev
   
   # Browser console
   # Press F12 → Console tab
   ```

2. **Search documentation:**
   - README.md - General setup
   - ARCHITECTURE.md - Technical design
   - DEPLOYMENT.md - Production setup
   - TESTING.md - Testing procedures

3. **Create a minimal reproduction:**
   ```bash
   # Document:
   # 1. Steps to reproduce
   # 2. Expected behavior
   # 3. Actual behavior
   # 4. Error messages/logs
   # 5. Environment (OS, Node version, database version)
   ```

4. **Contact support:**
   - File an issue in repository
   - Contact development team with reproduction steps

---

Last updated: June 2024
