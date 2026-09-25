import { roundMoney } from "@/lib/accounting/monthly-payment";

/**
 * Money the occupant fronted for the partnership (an out-of-pocket tax bill, or an expense
 * offset against rent), paid back from rent at amount / months per month.
 */
export type Advance = {
  amount: number;
  months: number;
  startMonth: Date;
};

/**
 * Suggested reimbursement for a rent month.
 *
 * Reimbursements already recorded are applied to advances oldest-first. Each advance that
 * has started and still has a balance contributes amount / months (or its remaining balance,
 * if smaller). A skipped month does not cause a catch-up; the schedule just runs longer.
 */
export function suggestReimbursement(input: {
  advances: Advance[];
  rentMonth: Date;
  /** All reimbursements recorded before this rent month's entries. */
  reimbursedBefore: number;
  /** Reimbursements already recorded for this rent month. */
  reimbursedThisMonth: number;
}) {
  let unapplied = input.reimbursedBefore;
  let rate = 0;
  const ordered = [...input.advances].sort(
    (left, right) => left.startMonth.getTime() - right.startMonth.getTime(),
  );

  for (const advance of ordered) {
    const applied = Math.min(unapplied, advance.amount);
    unapplied -= applied;
    const remaining = advance.amount - applied;
    if (remaining <= 0 || monthIndex(advance.startMonth) > monthIndex(input.rentMonth)) continue;
    rate += Math.min(remaining, advance.amount / Math.max(1, advance.months));
  }

  return roundMoney(Math.max(0, rate - input.reimbursedThisMonth));
}

export function outstandingAdvances(advances: Advance[], reimbursedTotal: number) {
  const total = advances.reduce((sum, advance) => sum + advance.amount, 0);
  return roundMoney(Math.max(0, total - reimbursedTotal));
}

/** Suggested reserve contribution: one month's share of the expected tax bill. */
export function suggestReserveContribution(input: {
  taxPerCycle: number;
  taxCycleMonths: number;
  contributedThisMonth: number;
}) {
  if (!(input.taxPerCycle > 0) || !(input.taxCycleMonths > 0)) return 0;
  return roundMoney(
    Math.max(0, input.taxPerCycle / input.taxCycleMonths - input.contributedThisMonth),
  );
}

export function monthIndex(date: Date) {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

export function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}
