# Architecture & Design Documentation

Comprehensive technical documentation for the Friends and Family Financing Portal.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Accounting Model](#accounting-model)
3. [Database Schema](#database-schema)
4. [API Design](#api-design)
5. [Security Architecture](#security-architecture)
6. [Data Flow Diagrams](#data-flow-diagrams)

## System Architecture

### Overview

The F&F Financing Portal is a full-stack Next.js application with a PostgreSQL database backend. The system is designed around transparent, deterministic accounting with complete audit trails.

```
┌─────────────────────────────────────────────────────────────┐
│                     User Browsers                           │
│  (Next.js SSR React Components with TypeScript)            │
└────────────────┬────────────────────────────────────────────┘
                 │ HTTPS
                 ↓
┌─────────────────────────────────────────────────────────────┐
│          Next.js Server (Node.js App Router)                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ • Authentication & Session Management                │   │
│  │ • API Route Handlers (JSON REST)                    │   │
│  │ • Server-side Rendering (SSR)                       │   │
│  │ • Security Middleware (headers, CSP, etc.)          │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────┬────────────────────────────────────────────┘
                 │ Connection Pool
                 ↓
┌─────────────────────────────────────────────────────────────┐
│           PostgreSQL Database (Primary)                      │
│  • Prisma ORM with Type Safety                             │
│  • Audit Logging (who/what/when)                           │
│  • Transaction Support (ACID)                              │
│  • Read Replicas (Optional for scale)                      │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | React | 19.2.4 |
| **Framework** | Next.js (App Router) | 16.2.7 |
| **Language** | TypeScript | 5.x |
| **Styling** | Tailwind CSS | 4.x |
| **Backend** | Node.js | 20+ |
| **ORM** | Prisma | 7.8.0 |
| **Database** | PostgreSQL | 14+ |
| **Auth** | Session-based (httpOnly cookies) | - |
| **Crypto** | Node.js `crypto` (scrypt) | Built-in |

### Key Design Principles

1. **Determinism**: Same inputs always produce same outputs (critical for accounting)
2. **Transparency**: Complete audit trail of all changes
3. **Atomicity**: Monthly postings are atomic transactions
4. **Type Safety**: Full TypeScript for runtime safety
5. **Security First**: Defense in depth across all layers
6. **Simplicity**: Minimal dependencies, clear data flow

## Accounting Model

### Monthly Payment Flow

The core accounting algorithm that runs when a payment is posted:

```
┌─────────────────────────────────────────────────────────────┐
│ Input: Monthly Payment Event                               │
│ {                                                           │
│   partnershipId: UUID,                                      │
│   paymentMonth: "2024-06",                                  │
│   totalPaid: 2000,                                          │
│   paidBy: "member-uuid",                                    │
│   description: "Monthly rent"                              │
│ }                                                           │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓ Load Partnership Context
┌─────────────────────────────────────────────────────────────┐
│ Query Database for:                                         │
│ • Partnership details (members, roles, approval mode)      │
│ • Current ownership percentages                            │
│ • Agreed monthly rent policy (effective for month)         │
│ • Tax reimbursement schedule                               │
│ • Previous month ownership snapshot                        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓ Step 1: Apply Agreed Rent
┌─────────────────────────────────────────────────────────────┐
│ Allocate monthly rent amount (e.g., $1,200):              │
│ • Split equally across all members                         │
│ • Each gets: $1,200 / N members                            │
│ Remaining: $2,000 - $1,200 = $800                          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓ Step 2: Apply Tax Reimbursements
┌─────────────────────────────────────────────────────────────┐
│ Tax schedule defines reimbursements per member:            │
│ • Member A owes: $200 (apply from remaining $800)         │
│ • Member B owes: $100 (apply from remaining $600)         │
│ New remaining: $300                                        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓ Step 3: Apply Extra to Occupant Ownership
┌─────────────────────────────────────────────────────────────┐
│ Remaining amount ($300) → Occupant purchase account        │
│ • Reduces occupant's purchase liability                    │
│ • Increases ownership percentage (calculated as equity)    │
│ • New ownership: 55% / 45% (was 50/50)                    │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓ Step 4: Create Snapshots & Audit Log
┌─────────────────────────────────────────────────────────────┐
│ Atomic Transaction:                                        │
│ 1. Create MonthlyPayment record                            │
│ 2. Create MonthlyPaymentAllocations (one per member)      │
│ 3. Create OwnershipSnapshots (new %)                      │
│ 4. Create AuditLog entry (with preview JSON)              │
│                                                           │
│ All succeed or all fail (ACID guarantee)                  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓ Output
┌─────────────────────────────────────────────────────────────┐
│ {                                                           │
│   paymentId: "uuid",                                        │
│   status: "POSTED",                                         │
│   summary: {                                                │
│     totalPaid: 2000,                                        │
│     rentApplied: 1200,                                      │
│     taxReimbursement: 300,                                  │
│     purchaseAmount: 500,                                    │
│     occupantCashOut: 500                                    │
│   },                                                        │
│   allocations: [                                            │
│     { memberId, rentAmount, taxAmount, purchaseAmount }   │
│   ],                                                        │
│   newOwnership: [{ memberId, percentage: 0.55 }]          │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘
```

### Ownership Calculation

Ownership percentage is calculated based on:

```
Ownership % = (Equity Contributed + Purchase Payments) / Total Property Value

Example:
• Total property value: $500,000
• Partner A initial contribution: $100,000
• Partner A purchase payments accumulated: $50,000
• Partner A's equity: $150,000
• Partner A's ownership: $150,000 / $500,000 = 30%
```

### Projection Algorithm

When simulating a buyout timeline:

```
For each month from start date:
  1. Calculate rent allocation using same algorithm
  2. Apply tax reimbursements
  3. Apply extra to occupant purchase
  4. Update occupant ownership % 
  5. If occupant reaches 100% ownership, stop
  
Output: Timeline array with:
  - Month number
  - Ownership percentages
  - Cumulative partner dividends
  - Partner cash received
```

## Database Schema

### Core Entity Models

#### User
```sql
CREATE TABLE "User" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  fullName VARCHAR(255) NOT NULL,
  passwordHash VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'PARTNER',  -- ADMIN or PARTNER
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Partnership
```sql
CREATE TABLE "Partnership" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  baseCurrency VARCHAR(3) DEFAULT 'USD',
  approvalMode VARCHAR(50) DEFAULT 'MONTHLY',  -- How often approvals happen
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### PartnershipMembership
```sql
CREATE TABLE "PartnershipMembership" (
  id UUID PRIMARY KEY,
  partnershipId UUID NOT NULL REFERENCES "Partnership"(id),
  userId UUID NOT NULL REFERENCES "User"(id),
  role VARCHAR(50) NOT NULL,  -- OCCUPANT, INVESTOR, PARTNER
  joinedAt TIMESTAMP NOT NULL,
  UNIQUE(partnershipId, userId)
);
```

#### Property
```sql
CREATE TABLE "Property" (
  id UUID PRIMARY KEY,
  partnershipId UUID NOT NULL REFERENCES "Partnership"(id),
  name VARCHAR(255) NOT NULL,
  addressLine1 VARCHAR(255),
  addressLine2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  postalCode VARCHAR(20),
  purchasePrice DECIMAL(14,2),
  purchaseDate DATE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Financial Models

#### MonthlyPayment (Core Ledger Entry)
```sql
CREATE TABLE "MonthlyPayment" (
  id UUID PRIMARY KEY,
  partnershipId UUID NOT NULL REFERENCES "Partnership"(id),
  paymentMonth DATE NOT NULL,
  totalPaid DECIMAL(14,2) NOT NULL,
  agreedRentApplied DECIMAL(14,2),
  taxReimbursement DECIMAL(14,2),
  netRentForSplit DECIMAL(14,2),
  ownershipPurchase DECIMAL(14,2),
  status VARCHAR(50) DEFAULT 'PENDING',  -- PENDING, POSTED, DISPUTED, VOIDED
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### MonthlyPaymentAllocation (Per-Member Breakdown)
```sql
CREATE TABLE "MonthlyPaymentAllocation" (
  id UUID PRIMARY KEY,
  paymentId UUID NOT NULL REFERENCES "MonthlyPayment"(id),
  membershipId UUID NOT NULL REFERENCES "PartnershipMembership"(id),
  ownershipPctBefore DECIMAL(5,2),
  ownershipPctAfter DECIMAL(5,2),
  rentAmount DECIMAL(14,2),
  purchaseAmount DECIMAL(14,2),
  taxAmount DECIMAL(14,2),
  UNIQUE(paymentId, membershipId)
);
```

#### OwnershipSnapshot (Monthly History)
```sql
CREATE TABLE "OwnershipSnapshot" (
  id UUID PRIMARY KEY,
  partnershipId UUID NOT NULL,
  membershipId UUID NOT NULL,
  effectiveMonth DATE NOT NULL,
  ownershipPercentage DECIMAL(5,2) NOT NULL,
  equityValuation DECIMAL(14,2),
  UNIQUE(partnershipId, membershipId, effectiveMonth)
);
```

#### AuditLog (Complete Change History)
```sql
CREATE TABLE "AuditLog" (
  id UUID PRIMARY KEY,
  partnershipId UUID NOT NULL,
  actorId UUID NOT NULL REFERENCES "User"(id),
  action VARCHAR(50) NOT NULL,  -- CREATE, UPDATE, DELETE, APPROVE, etc.
  entityType VARCHAR(50) NOT NULL,  -- MonthlyPayment, User, Property, etc.
  entityId UUID NOT NULL,
  beforeState JSONB,
  afterState JSONB,
  metadata JSONB,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Key Indexes for Performance

```sql
-- Ledger queries
CREATE INDEX idx_monthly_payment_partnership ON "MonthlyPayment"(partnershipId, paymentMonth DESC);

-- Ownership history
CREATE INDEX idx_ownership_snapshot_month ON "OwnershipSnapshot"(partnershipId, effectiveMonth DESC);

-- Member queries
CREATE INDEX idx_membership_partnership_user ON "PartnershipMembership"(partnershipId, userId);

-- Audit trail
CREATE INDEX idx_audit_log_entity ON "AuditLog"(entityType, entityId, createdAt DESC);
```

## API Design

### RESTful Principles

| Method | Resource | Action |
|--------|----------|--------|
| GET | `/api/ledger/:partnershipId` | Retrieve ledger |
| POST | `/api/monthly-payments/preview` | Preview payment calculation |
| POST | `/api/monthly-payments` | Post payment to ledger |
| POST | `/api/projections/estimate` | Run buyout projection |
| GET | `/api/exports/ledger` | Export ledger as CSV |
| GET | `/api/exports/projection-pdf` | Export projection as PDF |

### Request/Response Pattern

All endpoints follow this pattern:

```typescript
// Request
POST /api/endpoint
Content-Type: application/json
Authorization: (via session cookie)
{
  "partnershipId": "uuid",
  "paymentMonth": "2024-06",
  ...
}

// Success Response (200 OK)
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-06-07T10:30:00Z"
}

// Error Response (4xx or 5xx)
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [
      { "field": "paymentMonth", "message": "Must be YYYY-MM format" }
    ]
  },
  "timestamp": "2024-06-07T10:30:00Z"
}
```

### Authentication Flow

```
1. User submits email/password to POST /api/auth/login
2. Server validates credentials against database
3. Server verifies password hash (timing-safe comparison)
4. Server creates session and sets httpOnly cookie
5. Subsequent requests include cookie automatically
6. Server validates session on each request
7. POST /api/auth/logout clears cookie
```

## Security Architecture

### Authentication & Authorization

```
┌──────────────────────────────────────────────────────────┐
│ Request with Session Cookie                             │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ↓ Middleware: Parse Cookie
         ┌───────────────────┐
         │ ffp_session_user  │
         └────────┬──────────┘
                  │
                  ↓ getSessionUser()
         ┌────────────────────────────┐
         │ Query User from database    │
         │ by session user ID          │
         └────────┬───────────────────┘
                  │
                  ↓ Type-safe SessionUser object
         ┌────────────────────────────┐
         │ { id, email, fullName,     │
         │   role: ADMIN | PARTNER }  │
         └────────┬───────────────────┘
                  │
                  ↓ Check Authorization
         ┌────────────────────────────┐
         │ requirePartnershipAccess()  │
         │ (verify membership)         │
         └────────┬───────────────────┘
                  │
                  ↓ Request Handler
         ┌────────────────────────────┐
         │ Execute with full context  │
         │ (user + partnership scope) │
         └────────────────────────────┘
```

### Password Security

```typescript
// Hashing (one-way)
const salt = randomBytes(16);
const hash = scrypt(password, salt, 64);
const encoded = `${salt.toString('hex')}:${hash.toString('hex')}`;

// Verification (constant-time comparison)
const provided_hash = scrypt(password, salt, 64);
const is_valid = timingSafeEqual(provided_hash, stored_hash);
```

### Rate Limiting

```
IP-based sliding window for login attempts:
- Max 5 failed attempts per 15-minute window
- After 5 attempts: block for 15 minutes
- Prevents brute force attacks
```

### Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| X-Frame-Options | DENY | Prevent clickjacking |
| X-Content-Type-Options | nosniff | Prevent MIME type sniffing |
| Content-Security-Policy | ... | Restrict scripts, styles, etc. |
| Referrer-Policy | strict-origin-when-cross-origin | Prevent referrer leakage |
| Permissions-Policy | ... | Disable unnecessary browser features |

## Data Flow Diagrams

### Setup Wizard Flow

```
User (Browser)
    ↓
Login Page (/login)
    ↓
POST /api/auth/login
    ↓
Session Created (Cookie)
    ↓
GET /portal/setup
    ↓
Setup Wizard Form Displayed
    ↓
User Enters Partnership Data
    ↓
POST /api/setup/initialize
    ├── Validate input
    ├── Create Partnership
    ├── Create Users with hashed passwords
    ├── Create Property
    ├── Create OwnershipSnapshots
    └── Create AuditLog
    ↓
Success Response → Redirect to /portal/monthly
```

### Monthly Payment Posting Flow

```
User at /portal/monthly
    ↓
Enter Payment Amount
    ↓
POST /api/monthly-payments/preview
    ├── Load partnership context
    ├── Get ownership snapshots
    ├── Get rent policy (effective for month)
    ├── Get tax schedules
    └── computeMonthlyPaymentPreview()
    ↓
Display Preview to User
    ↓
User Reviews and Clicks "Post"
    ↓
POST /api/monthly-payments
    ├── Validate again
    ├── Load partnership context again
    ├── START TRANSACTION:
    │   ├── Create MonthlyPayment
    │   ├── Create MonthlyPaymentAllocations
    │   ├── Create OwnershipSnapshots
    │   └── Create AuditLog
    └── COMMIT TRANSACTION
    ↓
Return Payment ID
    ↓
Redirect to /portal/ledger → Show new entry
```

### Projection Flow

```
User at /portal/ledger
    ↓
Enters Monthly Payment Amount
    ↓
POST /api/projections/estimate
    ├── Load partnership
    ├── Get current ownership
    ├── FOR each month (up to 480 months):
    │   ├── computeMonthlyPaymentPreview()
    │   ├── Update ownership %
    │   └── If occupant reaches 100%, stop
    └── Compile timeline array
    ↓
Return Projection Data
    ↓
Display Timeline (months to buyout, totals, partner dividends)
    ↓
User Can Export as CSV or PDF
```

---

## Design Decisions & Rationale

### Why Monthly Snapshots?

- **Performance**: Query point-in-time ownership without iterating all historical payments
- **Auditability**: Snapshot captures agreed-upon values for that month
- **Correctness**: Ownership changes only on month boundaries

### Why Atomic Transactions?

- **Data Integrity**: All related records created together or not at all
- **Consistency**: No partial posting states
- **Recovery**: Easy rollback if system fails mid-transaction

### Why Audit Logging?

- **Transparency**: Partners can see exactly what changed and when
- **Compliance**: Complete history for legal/tax purposes
- **Debugging**: Trace issues to specific users/actions

### Why Rate Limiting?

- **Security**: Prevent brute force login attacks
- **Fairness**: One user can't monopolize resources
- **Observability**: Detects attack patterns

---

For questions about this architecture, refer to the main README or contact the development team.
