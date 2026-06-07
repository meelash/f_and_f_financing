# Friends and Family Financing Portal

A transparent accounting platform for co-owned properties with progressive buyout workflows. Built for partnerships where one owner is systematically bought out over time, with complete audit trails and projections.

## Features

✅ **Authentication & Authorization**
- Session-based auth with httpOnly cookies
- Secure password hashing (scrypt + timing-safe comparison)
- Role-based access control (Admin, Partner)
- Rate limiting on login (5 attempts per 15 minutes)

✅ **Partnership Management**
- Multi-member partnerships with flexible ownership structures
- Member role tracking (Occupant, Investor, Partner)
- Capital contribution tracking
- Monthly ownership snapshot history

✅ **Monthly Payment Processing**
- Deterministic rent allocation algorithm
- Tax reimbursement scheduling
- Occupant cash flow tracking
- Atomic transaction posting with audit logs
- Payment preview before posting

✅ **Financial Tracking**
- Complete audit trail (who changed what, when)
- Monthly ownership snapshots for historical queries
- Home expense tracking (amortization/valuation treatment)
- Attachment support for receipts/documentation

✅ **Projections & Reporting**
- Buyout timeline simulations
- Ownership transition forecasting
- CSV exports (ledger, projections)
- PDF projection reports
- Full ledger history with ownership timeline

## Tech Stack

- **Framework**: Next.js 16.2.7 (App Router)
- **Language**: TypeScript 5
- **Database**: PostgreSQL with Prisma 7.8.0
- **Frontend**: React 19.2.4, Tailwind CSS 4
- **Authentication**: Session-based with httpOnly cookies
- **Security**: Password hashing (scrypt), security headers, CSP

## Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL 14+ (local, Docker, or cloud)
- Docker & Docker Compose (for local dev database)

## Local Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

Copy the example environment file and update as needed:

```bash
cp .env.example .env.local
```

**For local Docker PostgreSQL:**
```
DATABASE_URL="postgresql://ffp_dev:ffp_dev_password@localhost:5432/ffp_db"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Start Local Database (Docker)

```bash
docker-compose up -d
```

Verify the database is healthy:
```bash
docker-compose ps
```

### 4. Initialize Database

Push the Prisma schema to your database:

```bash
npm run db:push
```

### 5. Seed Demo Data

Populate the database with demo partnership and users:

```bash
npm run db:seed
```

This creates:
- **Partnership**: "Demo Partnership" (MONTHLY approval mode)
- **Demo Users**:
  - Owner: `owner@example.com` / `OwnerDemo123!`
  - Partner: `partner@example.com` / `PartnerDemo123!`
- **Properties**: One property with initial valuations
- **Ownership Structure**: 50/50 split
- **Initial Contributions**: Tracked for each member
- **Ownership Snapshots**: Historical tracking enabled

### 6. Run Development Server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

### 7. Test the Workflow

**Login:**
- Go to http://localhost:3000/login
- Use `owner@example.com` / `OwnerDemo123!`

**Setup Wizard:**
- Already populated with demo data
- Review partnership details and member configuration

**Monthly Posting:**
- Navigate to "Monthly" section
- Enter a monthly payment amount (e.g., $2,000)
- Preview calculation before posting
- Post to create ledger entry

**View Ledger:**
- Navigate to "Ledger" section
- View all posted payments
- See ownership timeline
- Download CSV/PDF exports
- Run buyout projections

## Build & Production

### Build for Production

```bash
npm run build
```

### Run Production Build Locally

```bash
npm run start
```

### Docker Deployment

```bash
# Build image
docker build -t f-and-f-financing:latest .

# Run container
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/ffp_db" \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_APP_URL="https://your-domain.com" \
  -e NEXT_PUBLIC_SECURE_COOKIES=true \
  f-and-f-financing:latest
```

## Project Structure

```
src/
├── app/
│   ├── api/                    # API endpoints
│   │   ├── auth/              # Authentication routes
│   │   ├── monthly-payments/  # Payment posting
│   │   ├── ledger/            # Ledger queries
│   │   ├── projections/       # Buyout simulations
│   │   ├── exports/           # CSV/PDF exports
│   │   └── setup/             # Partnership initialization
│   ├── portal/                # Protected pages
│   │   ├── setup/             # Setup wizard
│   │   ├── monthly/           # Payment entry
│   │   └── ledger/            # Ledger viewer
│   └── login/                 # Public login page
├── components/                # Reusable React components
├── lib/
│   ├── auth/                  # Session & authorization
│   ├── accounting/            # Payment calculation logic
│   ├── config/                # Environment & database config
│   ├── projections/           # Simulation engine
│   └── observability/         # Logging
└── middleware.ts              # Security headers

prisma/
├── schema.prisma              # Database schema
└── seed.ts                    # Demo data seeding
```

## API Reference

### Authentication

**POST /api/auth/login**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```
Sets `ffp_session_user` cookie, returns user data.

**POST /api/auth/logout**
Clears session cookie.

**GET /api/auth/session**
Returns current authenticated user or `{ authenticated: false }`.

### Monthly Payments

**POST /api/monthly-payments/preview**
Preview payment allocation without posting:
```json
{
  "partnershipId": "uuid",
  "paymentMonth": "2024-06",
  "totalPaid": 2000,
  "paidBy": "member-id"
}
```

**POST /api/monthly-payments**
Post payment to ledger:
```json
{
  "partnershipId": "uuid",
  "paymentMonth": "2024-06",
  "totalPaid": 2000,
  "paidBy": "member-id"
}
```

### Ledger

**GET /api/ledger/[partnershipId]**
Returns all posted payments, allocations, and ownership timeline.

**Query Parameters:**
- `from`: Start date (ISO 8601)
- `to`: End date (ISO 8601)

### Projections

**POST /api/projections/estimate**
Simulate buyout timeline:
```json
{
  "partnershipId": "uuid",
  "monthlyPayment": 2000,
  "startMonth": "2024-06"
}
```

### Exports

**GET /api/exports/ledger?partnershipId=...&from=...&to=...**
Export ledger as CSV.

**GET /api/exports/projection?partnershipId=...&monthlyPayment=...&startMonth=...**
Export projection as CSV.

**GET /api/exports/projection-pdf?partnershipId=...&monthlyPayment=...&startMonth=...**
Export projection as PDF.

## Accounting Model

### Monthly Payment Flow

1. **Input**: Total amount paid in a month
2. **Rent Allocation**: Agreed monthly rent applied equally across all members
3. **Tax Reimbursement**: Applied sequentially to each member's tax schedule
4. **Purchase Accounting**: Remaining amount allocated to increase occupant's ownership share
5. **Output**: Per-member breakdown + new ownership snapshots

### Ownership Snapshots

Monthly snapshots capture:
- Each member's ownership percentage
- Equity valuation as of end of month
- Effective from/to dates for historical queries

### Audit Trail

All changes tracked with:
- Actor (user ID)
- Timestamp
- Action type (CREATE, UPDATE, DELETE, APPROVE, etc.)
- Before/after state (JSON)
- Linked transaction (payment, expense, etc.)

## Environment Variables

### Required

- `DATABASE_URL`: PostgreSQL connection string
- `NEXT_PUBLIC_APP_URL`: Application base URL (used for redirects)

### Optional

- `NODE_ENV`: `development` (default) or `production`
- `SESSION_COOKIE_NAME`: Name of session cookie (default: `ffp_session_user`)
- `SESSION_COOKIE_MAX_AGE`: Cookie expiry in seconds (default: 604800 = 7 days)
- `NEXT_PUBLIC_SECURE_COOKIES`: `true` to enforce HTTPS-only cookies (production)
- `DATABASE_POOL_MIN`: Min connections (production, default: 2)
- `DATABASE_POOL_MAX`: Max connections (production, default: 10)

## Security

### Implemented

- ✅ httpOnly cookies (prevents XSS token theft)
- ✅ CSRF tokens on forms (Next.js default)
- ✅ Secure password hashing (scrypt + salt)
- ✅ Timing-safe password comparison
- ✅ Rate limiting on login (5 attempts/15 min)
- ✅ Security headers (CSP, X-Frame-Options, etc.)
- ✅ Role-based access control
- ✅ Complete audit trail
- ✅ Non-root Docker user
- ✅ Environment validation on startup

### Recommendations for Production

- [ ] Enable HTTPS (use `NEXT_PUBLIC_SECURE_COOKIES=true`)
- [ ] Set up database automated backups
- [ ] Enable PostgreSQL SSL connections
- [ ] Configure WAF (Web Application Firewall)
- [ ] Set up monitoring and alerts
- [ ] Implement rate limiting on all endpoints (not just login)
- [ ] Enable database query logging for audit
- [ ] Use secrets manager for credentials
- [ ] Set up CI/CD with automated tests
- [ ] Enable database connection pooling (PgBouncer or Prisma pooling)

## Scripts

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint
npm run type-check       # Run TypeScript check

# Database
npm run db:push          # Push schema to database
npm run db:seed          # Seed demo data
npm run db:studio        # Open Prisma Studio
npm run db:generate      # Generate Prisma client
```

## Troubleshooting

### Database Connection Issues

**Error: "connect ECONNREFUSED 127.0.0.1:5432"**
- Ensure PostgreSQL is running
- Check DATABASE_URL is correct
- For Docker: `docker-compose ps` should show postgres running

**Error: "password authentication failed"**
- Verify credentials in DATABASE_URL
- Check default user is `ffp_dev` with password `ffp_dev_password` (dev only)

### Build Errors

**TypeScript errors**
```bash
npm run type-check
```

**Lint errors**
```bash
npm run lint -- --fix
```

### Session/Auth Issues

**Cookie not persisting:**
- Check NEXT_PUBLIC_SECURE_COOKIES setting (false for HTTP, true for HTTPS)
- Verify SESSION_COOKIE_NAME is consistent
- Clear browser cookies and retry

**Cannot login:**
- Verify database is populated: `npm run db:seed`
- Check user credentials: `owner@example.com` / `OwnerDemo123!`
- Review auth middleware in `/src/app/portal/layout.tsx`

## Next Steps

- [ ] Add email notifications for payment postings
- [ ] Implement two-factor authentication
- [ ] Add role-based dashboard customization
- [ ] Support multiple currencies with conversion
- [ ] Add bulk payment import (CSV)
- [ ] Implement approval workflows for large changes
- [ ] Add webhook notifications
- [ ] Mobile app support

## License

Proprietary - Created for specific partnership use case

3. Generate Prisma client:

```bash
npm run db:generate
```

4. Run migrations (after creating your first migration):

```bash
npm run db:migrate
```

5. Start development server:

```bash
npm run dev
```

Open http://localhost:3000

## Scripts

- `npm run dev` - Start dev server
- `npm run build` - Production build
- `npm run start` - Run built app
- `npm run lint` - ESLint checks
- `npm run db:generate` - Generate Prisma client
- `npm run db:migrate` - Run Prisma migrations in dev
- `npm run db:push` - Push schema directly to DB
- `npm run db:studio` - Open Prisma Studio
- `npm run db:seed` - Seed a starter two-user partnership
- `npm run smoke:accounting` - Run accounting engine smoke assertions

## Portal Routes

- `/` - Landing dashboard
- `/login` - Password-based login
- `/portal/setup` - Setup wizard
- `/portal/monthly` - Monthly preview + posting workflow
- `/portal/ledger` - Ledger and projection runner

## API Surface

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/demo/context`
- `POST /api/setup/initialize`
- `POST /api/monthly-payments/preview`
- `POST /api/monthly-payments`
- `GET /api/ledger/:partnershipId`
- `POST /api/projections/estimate`
- `GET /api/exports/ledger?partnershipId=...`
- `GET /api/exports/projection?partnershipId=...&occupantMembershipId=...&startMonth=...&monthlyTotalPaid=...`
- `GET /api/exports/projection-pdf?partnershipId=...&occupantMembershipId=...&startMonth=...&monthlyTotalPaid=...`

## Authentication

- Login now requires both email and password.
- Login endpoint enforces basic IP-based rate limiting for failed attempts
	(5 attempts per 15 minutes in-memory).
- Setup wizard requires `occupantPassword` and `investorPassword` (minimum 8 characters).
- All protected portal and accounting APIs require an authenticated session.

### Seed Credentials

Running `npm run db:seed` creates demo logins:

- Owner: `owner@example.com` / `OwnerDemo123!`
- Partner: `partner@example.com` / `PartnerDemo123!`

Change these immediately in non-demo environments.

## Architecture Notes

- Ownership and transaction history are modeled as ledger-friendly records.
- Approval workflow is represented at partnership level and defaults to no
	approval gate.
- Attachments are polymorphic via `(entityType, entityId)` links.
- Audit logs support before/after snapshots for admin edits and deletes.
- Monthly payment previews derive the effective rent policy, tax reimbursement,
	and ownership state from the database, then apply a deterministic allocation
	sequence.

## Preview Endpoint Example

- `POST /api/monthly-payments/preview`

Example body:

```json
{
	"partnershipId": "PARTNERSHIP_UUID",
	"occupantMembershipId": "MEMBERSHIP_UUID",
	"paymentMonth": "2026-02-01",
	"totalPaid": 3200
}
```

Optional overrides:

- `agreedRent`
- `propertyValuation`

## Deploy Options

Vercel:

1. Create a PostgreSQL database (Neon or Supabase).
2. Set `DATABASE_URL` in Vercel project environment variables.
3. Deploy with Vercel using this repo.

Container/VPS:

1. Build image:

```bash
docker build -t f-and-f-financing .
```

2. Run container:

```bash
docker run -p 3000:3000 -e DATABASE_URL="<your-url>" f-and-f-financing
```

## Next Build Steps

- Add attachment upload API and UI flow (receipt files).
- Replace JSON-heavy portal views with structured tables/charts.
- Add end-to-end tests for setup -> preview -> post -> projection -> export.
