import test from "node:test";
import assert from "node:assert/strict";

import { computeMonthlyPaymentPreview } from "@/lib/accounting/monthly-payment";

const PAYMENT_MONTH = new Date("2026-06-01T00:00:00.000Z");

function baseInput(overrides?: Partial<Parameters<typeof computeMonthlyPaymentPreview>[0]>) {
  return {
    paymentMonth: PAYMENT_MONTH,
    totalPaid: 2000,
    agreedRent: 3000,
    propertyValuation: 500000,
    occupantMembershipId: "owner",
    manualReimbursement: 500,
    ownerships: [
      {
        membershipId: "owner",
        displayLabel: "Owner",
        ownershipPct: 60,
        isOccupant: true,
      },
      {
        membershipId: "investor",
        displayLabel: "Investor",
        ownershipPct: 40,
        isOccupant: false,
      },
    ],
    taxSchedules: [],
    expenseSchedules: [],
    ...overrides,
  };
}

test("underpayment pays non-occupant full adjusted rent share first", () => {
  const base = baseInput();
  const preview = computeMonthlyPaymentPreview(base);

  const owner = preview.participants.find((participant) => participant.membershipId === "owner");
  const investor = preview.participants.find(
    (participant) => participant.membershipId === "investor",
  );

  assert.ok(owner);
  assert.ok(investor);

  const netRentForSplit = base.totalPaid - (base.manualReimbursement ?? 0);
  const investorRentAmount = ((base.agreedRent - (base.manualReimbursement ?? 0)) * base.ownerships.find((o) => o.membershipId === "investor")!.ownershipPct) / 100;
  const ownerRentAmount = netRentForSplit - investorRentAmount;
  const purchaseAmount = base.manualReimbursement + ownerRentAmount;

  assert.equal(preview.summary.netRentForSplit, base.totalPaid - base.manualReimbursement);
  assert.equal(investor.rentAmount, investorRentAmount);
  assert.equal(owner.rentAmount, ownerRentAmount);
  assert.equal(preview.summary.occupantRentShare, ownerRentAmount);
  assert.equal(preview.summary.requestedPurchaseAmount, purchaseAmount);
});

test("underpayment with limited funds gives all available net rent to non-occupant up to target", () => {
  const base = baseInput({
    totalPaid: 1200
  });
  const preview = computeMonthlyPaymentPreview(base);

  const owner = preview.participants.find((participant) => participant.membershipId === "owner");
  const investor = preview.participants.find(
    (participant) => participant.membershipId === "investor",
  );

  assert.ok(owner);
  assert.ok(investor);

  const netRentForSplit = base.totalPaid - (base.manualReimbursement ?? 0);
  const investorRentAmount = Math.min(netRentForSplit, ((base.agreedRent - (base.manualReimbursement ?? 0)) * base.ownerships.find((o) => o.membershipId === "investor")!.ownershipPct) / 100);
  const ownerRentAmount = netRentForSplit - investorRentAmount;
  const purchaseAmount = base.manualReimbursement + ownerRentAmount;

  assert.equal(preview.summary.netRentForSplit, 700);
  assert.equal(investor.rentAmount, 700);
  assert.equal(owner.rentAmount, 0);
  assert.equal(preview.summary.occupantRentShare, 0);
  assert.equal(preview.summary.requestedPurchaseAmount, purchaseAmount);
});

test("full rent month keeps pro-rata distribution", () => {
  const base = baseInput({
    totalPaid: 3000,
  });
  const preview = computeMonthlyPaymentPreview(base);

  const owner = preview.participants.find((participant) => participant.membershipId === "owner");
  const investor = preview.participants.find(
    (participant) => participant.membershipId === "investor",
  );

  assert.ok(owner);
  assert.ok(investor);

  const netRentForSplit = base.totalPaid - (base.manualReimbursement ?? 0);
  const investorRentAmount = ((base.agreedRent - (base.manualReimbursement ?? 0)) * base.ownerships.find((o) => o.membershipId === "investor")!.ownershipPct) / 100;
  const ownerRentAmount = netRentForSplit - investorRentAmount;
  const purchaseAmount = base.manualReimbursement + ownerRentAmount;

  assert.equal(preview.summary.netRentForSplit, netRentForSplit);
  assert.equal(investor.rentAmount, investorRentAmount);
  assert.equal(owner.rentAmount, ownerRentAmount);
  assert.equal(preview.summary.occupantRentShare, ownerRentAmount);
  assert.equal(preview.summary.requestedPurchaseAmount, purchaseAmount);
});

test("underpayment with no reimbursement uses full agreed rent as target base", () => {
  const base = baseInput({
    totalPaid: 2000,
    manualReimbursement: 0,
  });
  const preview = computeMonthlyPaymentPreview(base);

  const owner = preview.participants.find((participant) => participant.membershipId === "owner");
  const investor = preview.participants.find(
    (participant) => participant.membershipId === "investor",
  );

  assert.ok(owner);
  assert.ok(investor);

  const netRentForSplit = base.totalPaid - (base.manualReimbursement ?? 0);
  const investorRentAmount =
    ((base.agreedRent - (base.manualReimbursement ?? 0)) *
      base.ownerships.find((o) => o.membershipId === "investor")!.ownershipPct) /
    100;
  const ownerRentAmount = netRentForSplit - investorRentAmount;
  const purchaseAmount = (base.manualReimbursement ?? 0) + ownerRentAmount;

  assert.equal(preview.summary.netRentForSplit, netRentForSplit);
  assert.equal(investor.rentAmount, investorRentAmount);
  assert.equal(owner.rentAmount, ownerRentAmount);
  assert.equal(preview.summary.occupantRentShare, ownerRentAmount);
  assert.equal(preview.summary.requestedPurchaseAmount, purchaseAmount);
});

test("reimbursement larger than paid amount is capped to applied rent", () => {
  const base = baseInput({
    totalPaid: 1000,
    manualReimbursement: 1800,
  });
  const preview = computeMonthlyPaymentPreview(base);

  const owner = preview.participants.find((participant) => participant.membershipId === "owner");
  const investor = preview.participants.find(
    (participant) => participant.membershipId === "investor",
  );

  assert.ok(owner);
  assert.ok(investor);

  const agreedRentApplied = Math.min(base.totalPaid, base.agreedRent);
  const cappedReimbursement = Math.min(base.manualReimbursement ?? 0, agreedRentApplied);
  const netRentForSplit = agreedRentApplied - cappedReimbursement;
  const purchaseAmount = cappedReimbursement;

  assert.equal(preview.summary.taxReimbursement, cappedReimbursement);
  assert.equal(preview.summary.netRentForSplit, netRentForSplit);
  assert.equal(investor.rentAmount, 0);
  assert.equal(owner.rentAmount, 0);
  assert.equal(preview.summary.occupantRentShare, 0);
  assert.equal(preview.summary.requestedPurchaseAmount, purchaseAmount);
});

test("negative reimbursement reduces split base and does not add to requested purchase", () => {
  const base = baseInput({
    totalPaid: 2000,
    manualReimbursement: -200,
  });
  const preview = computeMonthlyPaymentPreview(base);

  const owner = preview.participants.find((participant) => participant.membershipId === "owner");
  const investor = preview.participants.find(
    (participant) => participant.membershipId === "investor",
  );

  assert.ok(owner);
  assert.ok(investor);

  const absoluteAdjustment = Math.abs(base.manualReimbursement ?? 0);
  const netRentForSplit = base.totalPaid - absoluteAdjustment;
  const investorRentAmount =
    ((base.agreedRent - absoluteAdjustment) *
      base.ownerships.find((o) => o.membershipId === "investor")!.ownershipPct) /
    100;
  const ownerRentAmount = netRentForSplit - investorRentAmount;
  const purchaseAmount = ownerRentAmount;

  assert.equal(preview.summary.taxReimbursement, -200);
  assert.equal(preview.summary.partnershipBalanceIncrease, 200);
  assert.equal(preview.summary.netRentForSplit, netRentForSplit);
  assert.equal(investor.rentAmount, investorRentAmount);
  assert.equal(owner.rentAmount, ownerRentAmount);
  assert.equal(preview.summary.occupantRentShare, ownerRentAmount);
  assert.equal(preview.summary.requestedPurchaseAmount, purchaseAmount);
});
