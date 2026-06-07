import assert from "node:assert/strict";
import { computeMonthlyPaymentPreview } from "../src/lib/accounting/monthly-payment";

const preview = computeMonthlyPaymentPreview({
  paymentMonth: new Date("2026-02-01T00:00:00.000Z"),
  totalPaid: 3000,
  agreedRent: 2000,
  propertyValuation: 200000,
  occupantMembershipId: "owner",
  ownerships: [
    {
      membershipId: "owner",
      displayLabel: "Owner Occupant",
      ownershipPct: 50,
      isOccupant: true,
    },
    {
      membershipId: "partner",
      displayLabel: "Financing Partner",
      ownershipPct: 50,
      isOccupant: false,
    },
  ],
  taxSchedules: [
    {
      paidByMembershipId: "owner",
      reimbursementStart: new Date("2026-01-01T00:00:00.000Z"),
      coverageMonths: 6,
      monthlyAmount: 600,
    },
  ],
});

assert.equal(preview.summary.agreedRentApplied, 2000);
assert.equal(preview.summary.taxReimbursement, 600);
assert.equal(preview.summary.netRentForSplit, 1400);
assert.equal(preview.summary.occupantRentShare, 700);
assert.equal(preview.summary.requestedPurchaseAmount, 2300);
assert.equal(preview.summary.appliedPurchaseAmount, 2300);

const owner = preview.participants.find((participant) => participant.membershipId === "owner");
const partner = preview.participants.find(
  (participant) => participant.membershipId === "partner",
);

assert.ok(owner);
assert.ok(partner);
assert.equal(owner?.ownershipPctAfter, 51.15);
assert.equal(partner?.ownershipPctAfter, 48.85);
assert.equal(partner?.purchaseAmount, 2300);
assert.equal(preview.warnings.length, 0);

console.log("Accounting smoke test passed.");
console.log(JSON.stringify(preview, null, 2));
