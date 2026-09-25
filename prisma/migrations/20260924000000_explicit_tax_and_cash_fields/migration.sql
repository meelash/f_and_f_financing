BEGIN;

-- Replace note-prefix conventions ("[POLICY]", "[OUT_OF_POCKET_PAYMENT]", "[RESERVE_PAYMENT]")
-- with real columns, and split the signed MonthlyPayment.taxReimbursement into
-- reimbursement (to occupant) and reserveContribution.

CREATE TYPE "TaxMode" AS ENUM ('OUT_OF_POCKET', 'RESERVE');
CREATE TYPE "TaxPaymentKind" AS ENUM ('OUT_OF_POCKET', 'RESERVE_PAYMENT');

-- Tax policy moves onto MonthlyPolicy.
ALTER TABLE "MonthlyPolicy"
  ADD COLUMN "taxMode" "TaxMode",
  ADD COLUMN "taxPerCycle" DECIMAL(14,2),
  ADD COLUMN "taxCycleMonths" INTEGER;

WITH latest AS (
  SELECT mp."id" AS policy_id, (
    SELECT t."id" FROM "TaxPayment" t
    WHERE t."partnershipId" = mp."partnershipId"
      AND t."note" LIKE '[POLICY]%'
      AND t."reimbursementStart" <= COALESCE(mp."effectiveTo", 'infinity'::timestamp)
    ORDER BY t."reimbursementStart" DESC, t."createdAt" DESC
    LIMIT 1
  ) AS tax_id
  FROM "MonthlyPolicy" mp
)
UPDATE "MonthlyPolicy" mp
SET "taxMode" = CASE WHEN t."note" LIKE '%mode=RESERVE%' THEN 'RESERVE'::"TaxMode" ELSE 'OUT_OF_POCKET'::"TaxMode" END,
    "taxPerCycle" = t."amount",
    "taxCycleMonths" = t."coverageMonths"
FROM latest
JOIN "TaxPayment" t ON t."id" = latest.tax_id
WHERE mp."id" = latest.policy_id;

DELETE FROM "TaxPayment" WHERE "note" LIKE '[POLICY]%';

-- Tax payments get an explicit kind.
ALTER TABLE "TaxPayment" ADD COLUMN "kind" "TaxPaymentKind";

UPDATE "TaxPayment"
SET "kind" = 'RESERVE_PAYMENT',
    "note" = NULLIF(TRIM(SUBSTRING("note" FROM LENGTH('[RESERVE_PAYMENT]') + 1)), '')
WHERE "note" LIKE '[RESERVE_PAYMENT]%';

UPDATE "TaxPayment"
SET "note" = NULLIF(TRIM(SUBSTRING("note" FROM LENGTH('[OUT_OF_POCKET_PAYMENT]') + 1)), '')
WHERE "note" LIKE '[OUT_OF_POCKET_PAYMENT]%';

UPDATE "TaxPayment" SET "kind" = 'OUT_OF_POCKET' WHERE "kind" IS NULL;

ALTER TABLE "TaxPayment" ALTER COLUMN "kind" SET NOT NULL;

-- Monthly payments: explicit cash flows.
ALTER TABLE "MonthlyPayment"
  ADD COLUMN "cashToInvestors" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "reserveContribution" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "occupantRetained" DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE "MonthlyPayment"
SET "reserveContribution" = -"taxReimbursement",
    "taxReimbursement" = 0
WHERE "taxReimbursement" < 0;

UPDATE "MonthlyPayment" p
SET "cashToInvestors" = COALESCE((
  SELECT SUM(a."rentAmount" + a."purchaseAmount")
  FROM "MonthlyPaymentAllocation" a
  JOIN "PartnerMembership" m ON m."id" = a."membershipId"
  WHERE a."monthlyPaymentId" = p."id" AND m."role" <> 'OCCUPANT'
), 0);

-- Legacy rows stored the occupant's notional rent share as rentAmount; from now on the
-- occupant's rentAmount means "dividend taken in cash", which legacy entries never did.
UPDATE "MonthlyPaymentAllocation" a
SET "rentAmount" = 0
FROM "PartnerMembership" m
WHERE m."id" = a."membershipId" AND m."role" = 'OCCUPANT';

COMMIT;
