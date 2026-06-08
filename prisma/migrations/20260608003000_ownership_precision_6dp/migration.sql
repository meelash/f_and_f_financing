ALTER TABLE "PartnerMembership"
ALTER COLUMN "initialOwnershipPct" TYPE DECIMAL(9,6);

ALTER TABLE "MonthlyPaymentAllocation"
ALTER COLUMN "ownershipPctBefore" TYPE DECIMAL(9,6);

ALTER TABLE "OwnershipSnapshot"
ALTER COLUMN "ownershipPct" TYPE DECIMAL(9,6);
