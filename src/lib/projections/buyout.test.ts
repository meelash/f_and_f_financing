import test from "node:test";
import assert from "node:assert/strict";

import { projectBuyoutTimeline } from "@/lib/projections/buyout";

const START_MONTH = new Date("2026-01-01T00:00:00.000Z");

function base500k(overrides?: Partial<Parameters<typeof projectBuyoutTimeline>[0]>) {
  return {
    startMonth: START_MONTH,
    monthlyTotalPaid: 3000,
    agreedRent: 3000,
    propertyValuation: 500_000,
    occupantMembershipId: "owner",
    ownerships: [
      { membershipId: "owner", displayLabel: "Owner", ownershipPct: 60, isOccupant: true },
      { membershipId: "investor", displayLabel: "Investor", ownershipPct: 40, isOccupant: false },
    ],
    taxSchedules: [],
    ...overrides,
  };
}

// --- Scenario: small property completes in exactly 2 months ---
//
// Month 1: investor=100%, owner=0%, valuation=1000, rent=100, totalPaid=600
//   agreedRentApplied=100, extra=500, rentForDividend=100
//   investor gets all rent: partnerRent=100
//   requestedPurchase = 500 + 100 = 600, appliedPurchase=600
//   pctSold = 600/1000*100 = 60  → investor=40%, owner=60%
//
// Month 2: investor=40%, owner=60%
//   agreedRentApplied=100, extra=500, rentForDividend=100
//   investor gets 40% of 100 = 40: partnerRent=40
//   requestedPurchase = 500 + 40 = 540, availableEquity = 40/100*1000 = 400
//   appliedPurchase = min(540, 400) = 400
//   pctSold = 400/1000*100 = 40 → investor=0%, owner=100% → done
//
// totalPartnerDividendRent = 100 + 40 = 140
// totalOwnershipPurchase   = 600 + 400 = 1000

test("completes in 2 months when payment exceeds rent and property is small", () => {
  const result = projectBuyoutTimeline({
    startMonth: START_MONTH,
    monthlyTotalPaid: 600,
    agreedRent: 100,
    propertyValuation: 1_000,
    occupantMembershipId: "owner",
    ownerships: [
      { membershipId: "owner", displayLabel: "Owner", ownershipPct: 0, isOccupant: true },
      { membershipId: "investor", displayLabel: "Investor", ownershipPct: 100, isOccupant: false },
    ],
    taxSchedules: [],
  });

  assert.equal(result.completed, true);
  assert.equal(result.monthsSimulated, 2);
  assert.equal(result.totalPartnerDividendRent, 140);
  assert.equal(result.totalOwnershipPurchase, 1000);
  assert.equal(result.history.length, 2);

  // Month 1
  const m1 = result.history[0];
  assert.equal(m1.agreedRentApplied, 100);
  assert.equal(m1.extraAfterRent, 500);
  assert.equal(m1.rentForDividend, 100);
  assert.equal(m1.sharedTaxAmount, 0);
  assert.equal(m1.partnerRent, 100);
  assert.equal(m1.ownershipPurchase, 600);
  assert.equal(m1.partnerOwnershipPct, 40);
  assert.equal(m1.occupantOwnershipPct, 60);
  assert.equal(m1.ownershipPctBeforeByMembership["owner"], 0);
  assert.equal(m1.ownershipPctBeforeByMembership["investor"], 100);
  assert.equal(m1.ownershipPctAfterByMembership["investor"], 40);
  assert.equal(m1.ownershipPctAfterByMembership["owner"], 60);

  // Month 2
  const m2 = result.history[1];
  assert.equal(m2.agreedRentApplied, 100);
  assert.equal(m2.extraAfterRent, 500);
  assert.equal(m2.rentForDividend, 100);
  assert.equal(m2.partnerRent, 40);
  assert.equal(m2.ownershipPurchase, 400);
  assert.equal(m2.partnerOwnershipPct, 0);
  assert.equal(m2.occupantOwnershipPct, 100);
  assert.equal(m2.ownershipPctBeforeByMembership["investor"], 40);
  assert.equal(m2.ownershipPctAfterByMembership["investor"], 0);
  assert.equal(m2.ownershipPctAfterByMembership["owner"], 100);
});

// --- Scenario: exact rent payment, no extra, first month ---
//
// owner=60%, investor=40%, valuation=500k, agreedRent=3000, totalPaid=3000
//   agreedRentApplied=3000, extra=0, rentForDividend=3000
//   investor gets 40% of 3000 = 1200: partnerRent=1200
//   requestedPurchase = 0 + 1200 = 1200
//   pctSold = 1200/500000*100 = 0.24
//   investor after = 40 - 0.24 = 39.76, owner after = 60 + 0.24 = 60.24

test("first month at exact agreed rent distributes rent and ownership correctly", () => {
  const result = projectBuyoutTimeline(base500k());

  const m1 = result.history[0];
  assert.equal(m1.agreedRentApplied, 3000);
  assert.equal(m1.extraAfterRent, 0);
  assert.equal(m1.rentForDividend, 3000);
  assert.equal(m1.sharedTaxAmount, 0);
  assert.equal(m1.partnerRent, 1200);
  assert.equal(m1.ownershipPurchase, 1200);
  assert.equal(m1.ownershipPctBeforeByMembership["owner"], 60);
  assert.equal(m1.ownershipPctBeforeByMembership["investor"], 40);
  assert.equal(m1.ownershipPctAfterByMembership["investor"], 39.76);
  assert.equal(m1.ownershipPctAfterByMembership["owner"], 60.24);
});

// --- Scenario: overpayment — extra above rent goes directly to equity purchase ---
//
// totalPaid=4000, agreedRent=3000 → extra=1000
//   partnerRent = 40% of 3000 = 1200
//   requestedPurchase = 1000 + 1200 = 2200
//   pctSold = 2200/500000*100 = 0.44
//   investor after = 40 - 0.44 = 39.56

test("overpayment above agreed rent increases equity purchase", () => {
  const result = projectBuyoutTimeline(base500k({ monthlyTotalPaid: 4000 }));

  const m1 = result.history[0];
  assert.equal(m1.agreedRentApplied, 3000);
  assert.equal(m1.extraAfterRent, 1000);
  assert.equal(m1.partnerRent, 1200);
  assert.equal(m1.ownershipPurchase, 2200);
  assert.equal(m1.ownershipPctAfterByMembership["investor"], 39.56);
  assert.equal(m1.ownershipPctAfterByMembership["owner"], 60.44);
});

// --- Scenario: underpayment below agreed rent ---
//
// totalPaid=2000, agreedRent=3000 → agreedRentApplied=2000, extra=0
//   investor gets 40% of 2000 = 800: partnerRent=800
//   requestedPurchase = 0 + 800 = 800
//   pctSold = 800/500000*100 = 0.16
//   investor after = 40 - 0.16 = 39.84

test("underpayment below agreed rent reduces purchase proportionally", () => {
  const result = projectBuyoutTimeline(base500k({ monthlyTotalPaid: 2000 }));

  const m1 = result.history[0];
  assert.equal(m1.agreedRentApplied, 2000);
  assert.equal(m1.extraAfterRent, 0);
  assert.equal(m1.partnerRent, 800);
  assert.equal(m1.ownershipPurchase, 800);
  assert.equal(m1.ownershipPctAfterByMembership["investor"], 39.84);
  assert.equal(m1.ownershipPctAfterByMembership["owner"], 60.16);
});

// --- Scenario: recurring tax reduces rent available for dividends ---
//
// taxSchedule of 300/month (recurring)
//   taxAppliedToRent = min(3000, 300) = 300
//   rentForDividend = 3000 - 300 = 2700
//   investor gets 40% of 2700 = 1080: partnerRent=1080
//   requestedPurchase = 0 + 1080 = 1080
//   pctSold = 1080/500000*100 = 0.216
//   investor after = 40 - 0.216 = 39.784

test("recurring tax schedule reduces dividends and purchase amount", () => {
  const result = projectBuyoutTimeline(
    base500k({
      taxSchedules: [
        {
          reimbursementStart: new Date("2025-01-01T00:00:00.000Z"),
          coverageMonths: 1,
          monthlyAmount: 300,
          recurrence: "RECURRING",
        },
      ],
    }),
  );

  const m1 = result.history[0];
  assert.equal(m1.sharedTaxAmount, 300);
  assert.equal(m1.rentForDividend, 2700);
  assert.equal(m1.partnerRent, 1080);
  assert.equal(m1.ownershipPurchase, 1080);
  assert.equal(m1.ownershipPctAfterByMembership["investor"], 39.784);
  assert.equal(m1.ownershipPctAfterByMembership["owner"], 60.216);
});

// --- Scenario: projection does not complete within maxMonths ---

test("returns completed=false when maxMonths is reached without buyout", () => {
  const result = projectBuyoutTimeline(base500k({ maxMonths: 3 }));

  assert.equal(result.completed, false);
  assert.equal(result.buyoutMonth, null);
  assert.equal(result.monthsSimulated, 3);
  assert.equal(result.history.length, 3);
});
