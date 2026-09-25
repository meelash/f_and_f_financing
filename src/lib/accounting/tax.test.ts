import test from "node:test";
import assert from "node:assert/strict";

import { outstandingAdvances, suggestReimbursement } from "@/lib/accounting/tax";

const utc = (month: string) => new Date(`${month}-01T00:00:00.000Z`);
// The real case: 4023.82 paid out of pocket in Feb, reimbursed over 6 months.
const feb = [{ amount: 4023.82, months: 6, startMonth: utc("2026-02") }];

test("suggests amount / months, not remaining / months", () => {
  assert.equal(
    suggestReimbursement({ advances: feb, rentMonth: utc("2026-06"), reimbursedBefore: 0, reimbursedThisMonth: 0 }),
    670.64,
  );
  assert.equal(
    suggestReimbursement({ advances: feb, rentMonth: utc("2026-09"), reimbursedBefore: 2682.56, reimbursedThisMonth: 0 }),
    670.64,
  );
});

test("does not catch up skipped months; the last month is the remainder", () => {
  assert.equal(
    suggestReimbursement({ advances: feb, rentMonth: utc("2026-12"), reimbursedBefore: 3353.2, reimbursedThisMonth: 0 }),
    670.62,
  );
  assert.equal(
    suggestReimbursement({ advances: feb, rentMonth: utc("2027-01"), reimbursedBefore: 4023.82, reimbursedThisMonth: 0 }),
    0,
  );
});

test("a second entry in the same month suggests nothing more", () => {
  assert.equal(
    suggestReimbursement({ advances: feb, rentMonth: utc("2026-09"), reimbursedBefore: 2682.56, reimbursedThisMonth: 670.64 }),
    0,
  );
});

test("nothing before the advance was paid", () => {
  assert.equal(
    suggestReimbursement({ advances: feb, rentMonth: utc("2026-01"), reimbursedBefore: 0, reimbursedThisMonth: 0 }),
    0,
  );
});

test("overlapping advances add their rates; older ones are repaid first", () => {
  const advances = [
    ...feb,
    { amount: 1200, months: 12, startMonth: utc("2026-08") },
  ];
  assert.equal(
    suggestReimbursement({ advances, rentMonth: utc("2026-09"), reimbursedBefore: 2682.56, reimbursedThisMonth: 0 }),
    770.64,
  );
  assert.equal(outstandingAdvances(advances, 2682.56), 2541.26);
});
