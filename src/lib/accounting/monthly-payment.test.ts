import test from "node:test";
import assert from "node:assert/strict";

import { computeMonthlyPayment, type MonthlyPaymentInput } from "@/lib/accounting/monthly-payment";

// Rent 3000, tax 500/month, occupant 60% / investor 40%.
// Net rent 2500 → investor dividend 1000, occupant dividend 1500.
function input(overrides: Partial<MonthlyPaymentInput> = {}): MonthlyPaymentInput {
  return {
    agreedRent: 3000,
    propertyValuation: 500_000,
    ownerships: [
      { membershipId: "occ", displayLabel: "Occupant", ownershipPct: 60, isOccupant: true },
      { membershipId: "inv", displayLabel: "Investor", ownershipPct: 40, isOccupant: false },
    ],
    taxReimbursement: 500,
    reserveContribution: 0,
    payment: { mode: "TOTAL", amount: 3000 },
    ...overrides,
  };
}

const member = (result: ReturnType<typeof computeMonthlyPayment>, id: string) =>
  result.participants.find((participant) => participant.membershipId === id)!;

test("full rent: investor gets dividend, everything else buys equity", () => {
  const result = computeMonthlyPayment(input());
  assert.equal(result.summary.investorDividends, 1000);
  assert.equal(result.summary.ownershipPurchase, 2000);
  assert.equal(result.summary.cashToInvestors, 3000);
  assert.equal(result.summary.taxReimbursement, 500);
  assert.equal(result.summary.dividendShortfall, 0);
  assert.equal(result.expected.total, 3000);
  assert.equal(member(result, "inv").ownershipPctAfter, 39.6);
  assert.equal(member(result, "occ").ownershipPctAfter, 60.4);
  assert.deepEqual(result.warnings, []);
});

test("cash-to-investors view gives the same result as the total view", () => {
  const total = computeMonthlyPayment(input());
  const cash = computeMonthlyPayment(input({ payment: { mode: "CASH_TO_INVESTORS", amount: 3000 } }));
  assert.deepEqual(cash.summary, total.summary);
});

test("taking dividend and reimbursement in cash: investor paid in full, no equity bought", () => {
  const result = computeMonthlyPayment(
    input({ takeDividend: true, takeReimbursement: true }),
  );
  assert.equal(result.summary.investorDividends, 1000);
  assert.equal(result.summary.cashToInvestors, 1000);
  assert.equal(result.summary.occupantRetained, 2000);
  assert.equal(result.summary.occupantDividendTaken, 1500);
  assert.equal(result.summary.taxReimbursement, 500);
  assert.equal(result.summary.ownershipPurchase, 0);
  assert.equal(result.expected.cashToInvestors, 1000);
  assert.equal(member(result, "occ").ownershipPctAfter, 60);
  assert.deepEqual(result.warnings, []);
});

test("same scenario entered as cash to investors", () => {
  const result = computeMonthlyPayment(
    input({
      takeDividend: true,
      takeReimbursement: true,
      payment: { mode: "CASH_TO_INVESTORS", amount: 1000 },
    }),
  );
  assert.equal(result.summary.totalPaid, 3000);
  assert.equal(result.summary.ownershipPurchase, 0);
  assert.equal(result.summary.occupantRetained, 2000);
});

test("paying less than the dividend: all to dividend, shortfall reported, nothing buys equity", () => {
  const result = computeMonthlyPayment(input({ payment: { mode: "CASH_TO_INVESTORS", amount: 800 } }));
  assert.equal(result.summary.investorDividends, 800);
  assert.equal(result.summary.dividendShortfall, 200);
  assert.equal(result.summary.ownershipPurchase, 0);
  // The reimbursement was not funded, so it stays owed to the occupant.
  assert.equal(result.summary.taxReimbursement, 0);
  assert.equal(result.warnings.length, 2);
});

test("a later entry for the same month pays the remaining dividend first", () => {
  const result = computeMonthlyPayment(
    input({
      taxReimbursement: 0,
      prior: {
        rentApplied: 800,
        taxReimbursement: 500,
        reserveContribution: 0,
        occupantDividendTaken: 0,
        dividendsPaid: { inv: 800 },
      },
      payment: { mode: "CASH_TO_INVESTORS", amount: 1000 },
    }),
  );
  assert.equal(result.summary.investorDividends, 200);
  assert.equal(result.summary.ownershipPurchase, 800);
});

test("extra lump sum after the month's rent is fully paid is all equity", () => {
  const result = computeMonthlyPayment(
    input({
      taxReimbursement: 0,
      prior: {
        rentApplied: 3000,
        taxReimbursement: 500,
        reserveContribution: 0,
        occupantDividendTaken: 0,
        dividendsPaid: { inv: 1000 },
      },
      payment: { mode: "TOTAL", amount: 5000 },
    }),
  );
  assert.equal(result.summary.investorDividends, 0);
  assert.equal(result.summary.ownershipPurchase, 5000);
  assert.equal(result.summary.agreedRentApplied, 0);
});

test("dividends use ownership at the start of the rent month", () => {
  const result = computeMonthlyPayment(
    input({
      ownerships: [
        { membershipId: "occ", displayLabel: "Occupant", ownershipPct: 70, isOccupant: true },
        { membershipId: "inv", displayLabel: "Investor", ownershipPct: 30, isOccupant: false },
      ],
      monthStartOwnershipPct: { occ: 60, inv: 40 },
    }),
  );
  assert.equal(result.summary.investorDividends, 1000);
});

test("reserve mode: reserve comes off rent and is not sent to investors", () => {
  const result = computeMonthlyPayment(input({ taxReimbursement: 0, reserveContribution: 500 }));
  assert.equal(result.summary.reserveContribution, 500);
  assert.equal(result.summary.investorDividends, 1000);
  assert.equal(result.summary.cashToInvestors, 2500);
  assert.equal(result.summary.ownershipPurchase, 1500);
  assert.equal(result.expected.cashToInvestors, 2500);
});

test("multiple investors split dividends and sales by ownership", () => {
  const result = computeMonthlyPayment(
    input({
      taxReimbursement: 0,
      ownerships: [
        { membershipId: "occ", displayLabel: "Occupant", ownershipPct: 50, isOccupant: true },
        { membershipId: "a", displayLabel: "A", ownershipPct: 30, isOccupant: false },
        { membershipId: "b", displayLabel: "B", ownershipPct: 20, isOccupant: false },
      ],
    }),
  );
  assert.equal(member(result, "a").rentAmount, 900);
  assert.equal(member(result, "b").rentAmount, 600);
  assert.equal(member(result, "a").purchaseAmount, 900);
  assert.equal(member(result, "b").purchaseAmount, 600);
  assert.equal(result.summary.cashToInvestors, 3000);
});

test("purchase is capped at the equity investors have left", () => {
  const result = computeMonthlyPayment(
    input({
      taxReimbursement: 0,
      propertyValuation: 1000,
      payment: { mode: "TOTAL", amount: 3000 },
    }),
  );
  assert.equal(result.summary.ownershipPurchase, 400);
  assert.equal(member(result, "occ").ownershipPctAfter, 100);
  assert.equal(member(result, "inv").ownershipPctAfter, 0);
  assert.ok(result.summary.unappliedPurchase > 0);
});

test("tax items above the rent are rejected", () => {
  assert.throws(() => computeMonthlyPayment(input({ taxReimbursement: 2000, reserveContribution: 1500 })));
});
