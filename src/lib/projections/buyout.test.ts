import test from "node:test";
import assert from "node:assert/strict";

import { projectBuyoutTimeline } from "@/lib/projections/buyout";

const START = new Date("2026-01-01T00:00:00.000Z");

// Valuation 1000, rent 100, occupant pays 600/month, starting at 0%.
// Month 1: investor 100% → dividend 100, purchase 500 → investor 50%.
// Month 2: dividend 50, purchase 550 capped at the 500 left → done.
test("small property buys out in 2 months without double-counting dividends", () => {
  const result = projectBuyoutTimeline({
    startMonth: START,
    monthlyTotalPaid: 600,
    agreedRent: 100,
    propertyValuation: 1000,
    ownerships: [
      { membershipId: "occ", displayLabel: "Occupant", ownershipPct: 0, isOccupant: true },
      { membershipId: "inv", displayLabel: "Investor", ownershipPct: 100, isOccupant: false },
    ],
  });

  assert.equal(result.completed, true);
  assert.equal(result.monthsSimulated, 2);
  assert.equal(result.buyoutMonth, "2026-02-01");
  assert.equal(result.history[0].investorDividends, 100);
  assert.equal(result.history[0].ownershipPurchase, 500);
  assert.equal(result.history[0].ownershipPctAfter.inv, 50);
  assert.equal(result.history[1].investorDividends, 50);
  assert.equal(result.history[1].ownershipPurchase, 500);
  assert.equal(result.totalInvestorDividends, 150);
  assert.equal(result.totalOwnershipPurchase, 1000);
});

test("out-of-pocket tax reimbursement buys equity; reserve does not", () => {
  const base = {
    startMonth: START,
    monthlyTotalPaid: 3000,
    agreedRent: 3000,
    propertyValuation: 500_000,
    ownerships: [
      { membershipId: "occ", displayLabel: "Occupant", ownershipPct: 60, isOccupant: true },
      { membershipId: "inv", displayLabel: "Investor", ownershipPct: 40, isOccupant: false },
    ],
    maxMonths: 1,
  };
  const oop = projectBuyoutTimeline({ ...base, monthlyTax: { mode: "OUT_OF_POCKET", amount: 500 } });
  const reserve = projectBuyoutTimeline({ ...base, monthlyTax: { mode: "RESERVE", amount: 500 } });
  assert.equal(oop.history[0].investorDividends, 1000);
  assert.equal(oop.history[0].ownershipPurchase, 2000);
  assert.equal(reserve.history[0].investorDividends, 1000);
  assert.equal(reserve.history[0].ownershipPurchase, 1500);
});

test("stops early when the payment never buys equity", () => {
  const result = projectBuyoutTimeline({
    startMonth: START,
    monthlyTotalPaid: 1000,
    agreedRent: 3000,
    propertyValuation: 500_000,
    ownerships: [
      { membershipId: "occ", displayLabel: "Occupant", ownershipPct: 0, isOccupant: true },
      { membershipId: "inv", displayLabel: "Investor", ownershipPct: 100, isOccupant: false },
    ],
  });
  assert.equal(result.completed, false);
  assert.equal(result.monthsSimulated, 1);
});
