import { prisma } from "@/lib/prisma";
import {
  emptyPrior,
  roundMoney,
  type OwnershipPosition,
  type PriorMonthEntries,
} from "@/lib/accounting/monthly-payment";
import {
  addMonths,
  monthIndex,
  monthStart,
  outstandingAdvances,
  suggestReimbursement,
  suggestReserveContribution,
  type Advance,
} from "@/lib/accounting/tax";

export type TaxPolicy = {
  mode: "OUT_OF_POCKET" | "RESERVE";
  taxPerCycle: number;
  taxCycleMonths: number;
};

export type EntryContext = {
  partnershipId: string;
  occupantMembershipId: string;
  rentMonth: Date;
  paidOn: Date;
  agreedRent: number;
  valuation: number;
  taxPolicy: TaxPolicy | null;
  ownerships: OwnershipPosition[];
  monthStartOwnershipPct: Record<string, number>;
  prior: PriorMonthEntries;
  suggested: { taxReimbursement: number; reserveContribution: number };
  balances: Balances;
};

export type Balances = {
  /** Prepaid taxes/expenses not yet reimbursed to the occupant. */
  owedToOccupant: number;
  /** Money set aside in the tax reserve, minus tax bills paid from it. */
  reserveBalance: number;
};

type LoadedPartnership = NonNullable<Awaited<ReturnType<typeof loadPartnership>>>;

export async function loadPartnership(partnershipId: string) {
  return prisma.partnership.findUnique({
    where: { id: partnershipId },
    include: {
      properties: { orderBy: { createdAt: "asc" } },
      memberships: { include: { user: true } },
      monthlyPolicies: true,
      taxPayments: true,
      homeExpenses: true,
      monthlyPayments: {
        include: { allocations: true },
        orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
      },
    },
  });
}

export async function loadEntryContext(input: {
  partnershipId: string;
  rentMonth: Date;
  paidOn: Date;
}): Promise<EntryContext> {
  const partnership = await loadPartnership(input.partnershipId);
  if (!partnership) throw new Error("Partnership not found.");

  const occupant = findOccupant(partnership);
  const rentMonth = monthStart(input.rentMonth);
  const policy = effectivePolicy(partnership, rentMonth);
  const taxPolicy = toTaxPolicy(policy);
  const valuation = Number(
    partnership.properties[0]?.currentValuation ?? partnership.properties[0]?.initialValuation ?? 0,
  );
  if (!(valuation > 0)) throw new Error("Set a property valuation before recording rent.");

  const ownerships = await ownershipAsOf(partnership, occupant.id, input.paidOn);

  // Earlier entries for this rent month.
  const monthEntries = partnership.monthlyPayments.filter(
    (payment) => monthIndex(payment.paymentMonth) === monthIndex(rentMonth),
  );
  const prior = emptyPrior();
  for (const entry of monthEntries) {
    prior.rentApplied += Number(entry.agreedRentApplied);
    prior.taxReimbursement += Number(entry.taxReimbursement);
    prior.reserveContribution += Number(entry.reserveContribution);
    for (const allocation of entry.allocations) {
      const amount = Number(allocation.rentAmount);
      if (allocation.membershipId === occupant.id) {
        prior.occupantDividendTaken += amount;
      } else {
        prior.dividendsPaid[allocation.membershipId] =
          (prior.dividendsPaid[allocation.membershipId] ?? 0) + amount;
      }
    }
  }

  // Dividends are based on ownership when the rent month's first entry was made.
  const monthStartOwnershipPct: Record<string, number> = Object.fromEntries(
    ownerships.map((position) => [position.membershipId, position.ownershipPct]),
  );
  for (const allocation of monthEntries[0]?.allocations ?? []) {
    monthStartOwnershipPct[allocation.membershipId] = Number(allocation.ownershipPctBefore);
  }

  const reimbursedTotal = sumBy(partnership.monthlyPayments, (payment) => Number(payment.taxReimbursement));
  const suggestedReimbursement = suggestReimbursement({
    advances: advancesFor(partnership, occupant.id),
    rentMonth,
    reimbursedBefore: reimbursedTotal - prior.taxReimbursement,
    reimbursedThisMonth: prior.taxReimbursement,
  });
  const suggestedReserve =
    taxPolicy?.mode === "RESERVE"
      ? suggestReserveContribution({
          taxPerCycle: taxPolicy.taxPerCycle,
          taxCycleMonths: taxPolicy.taxCycleMonths,
          contributedThisMonth: prior.reserveContribution,
        })
      : 0;

  // Never suggest more tax items than the rent left in this month can carry.
  const agreedRent = Number(policy.agreedRent);
  const rentRoom = Math.max(0, agreedRent - prior.taxReimbursement - prior.reserveContribution);
  const reserveContribution = Math.min(suggestedReserve, rentRoom);
  const taxReimbursement = Math.min(suggestedReimbursement, rentRoom - reserveContribution);

  return {
    partnershipId: partnership.id,
    occupantMembershipId: occupant.id,
    rentMonth,
    paidOn: input.paidOn,
    agreedRent,
    valuation,
    taxPolicy,
    ownerships,
    monthStartOwnershipPct,
    prior: roundPrior(prior),
    suggested: {
      taxReimbursement: roundMoney(taxReimbursement),
      reserveContribution: roundMoney(reserveContribution),
    },
    balances: balancesFor(partnership),
  };
}

export function findOccupant(partnership: LoadedPartnership) {
  const occupant = partnership.memberships.find(
    (membership) => membership.role === "OCCUPANT" && membership.isActive,
  );
  if (!occupant) throw new Error("Partnership has no active occupant.");
  return occupant;
}

export function effectivePolicy(partnership: LoadedPartnership, month: Date) {
  const nextMonth = addMonths(month, 1);
  const policy = partnership.monthlyPolicies
    .filter((candidate) => candidate.effectiveFrom < nextMonth)
    .filter((candidate) => !candidate.effectiveTo || candidate.effectiveTo >= month)
    .sort(
      (left, right) =>
        right.effectiveFrom.getTime() - left.effectiveFrom.getTime() ||
        right.createdAt.getTime() - left.createdAt.getTime(),
    )[0];
  if (!policy) throw new Error("No rent policy is in effect for that month.");
  return policy;
}

export function toTaxPolicy(policy: {
  taxMode: "OUT_OF_POCKET" | "RESERVE" | null;
  taxPerCycle: unknown;
  taxCycleMonths: number | null;
}): TaxPolicy | null {
  if (!policy.taxMode) return null;
  return {
    mode: policy.taxMode,
    taxPerCycle: Number(policy.taxPerCycle ?? 0),
    taxCycleMonths: policy.taxCycleMonths ?? 12,
  };
}

export function advancesFor(partnership: LoadedPartnership, occupantMembershipId: string): Advance[] {
  const taxAdvances = partnership.taxPayments
    .filter((payment) => payment.kind === "OUT_OF_POCKET")
    .map((payment) => ({
      amount: Number(payment.amount),
      months: payment.coverageMonths,
      startMonth: monthStart(payment.reimbursementStart),
    }));
  const expenseAdvances = partnership.homeExpenses
    .filter((expense) => expense.treatment === "AMORTIZE_OFFSET")
    .filter((expense) => (expense.paidByMembershipId ?? occupantMembershipId) === occupantMembershipId)
    .map((expense) => ({
      amount: Number(expense.amount),
      months: expense.amortizationMonths ?? 1,
      startMonth: monthStart(expense.offsetStartMonth ?? expense.incurredOn),
    }));
  return [...taxAdvances, ...expenseAdvances];
}

export function balancesFor(partnership: LoadedPartnership): Balances {
  const occupant = findOccupant(partnership);
  const reimbursed = sumBy(partnership.monthlyPayments, (payment) => Number(payment.taxReimbursement));
  const contributed = sumBy(partnership.monthlyPayments, (payment) => Number(payment.reserveContribution));
  const paidFromReserve = sumBy(
    partnership.taxPayments.filter((payment) => payment.kind === "RESERVE_PAYMENT"),
    (payment) => Number(payment.amount),
  );
  return {
    owedToOccupant: outstandingAdvances(advancesFor(partnership, occupant.id), reimbursed),
    reserveBalance: roundMoney(contributed - paidFromReserve),
  };
}

/** Latest ownership snapshot per member on or before `asOf`, falling back to initial ownership. */
export async function ownershipAsOf(
  partnership: LoadedPartnership,
  occupantMembershipId: string,
  asOf: Date,
): Promise<OwnershipPosition[]> {
  const snapshots = await prisma.ownershipSnapshot.findMany({
    where: { partnershipId: partnership.id, asOf: { lte: asOf } },
    orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
  });
  const latest = new Map<string, number>();
  for (const snapshot of snapshots) {
    if (!latest.has(snapshot.membershipId)) {
      latest.set(snapshot.membershipId, Number(snapshot.ownershipPct));
    }
  }
  return partnership.memberships
    .filter((membership) => membership.isActive)
    .map((membership) => ({
      membershipId: membership.id,
      displayLabel: membership.displayLabel || membership.user.fullName,
      ownershipPct: latest.get(membership.id) ?? Number(membership.initialOwnershipPct),
      isOccupant: membership.id === occupantMembershipId,
    }));
}

function roundPrior(prior: PriorMonthEntries): PriorMonthEntries {
  return {
    rentApplied: roundMoney(prior.rentApplied),
    taxReimbursement: roundMoney(prior.taxReimbursement),
    reserveContribution: roundMoney(prior.reserveContribution),
    occupantDividendTaken: roundMoney(prior.occupantDividendTaken),
    dividendsPaid: Object.fromEntries(
      Object.entries(prior.dividendsPaid).map(([key, value]) => [key, roundMoney(value)]),
    ),
  };
}

function sumBy<T>(items: T[], pick: (item: T) => number) {
  return roundMoney(items.reduce((total, item) => total + pick(item), 0));
}

/** "YYYY-MM-DD" → that date at 00:00 UTC. Rejects anything else. */
export function parseDateOnly(value: unknown, label: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!match) throw new Error(`${label} must be a date (YYYY-MM-DD).`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/** "YYYY-MM" or "YYYY-MM-DD" → first of that month, UTC. */
export function parseMonth(value: unknown, label: string) {
  const match = /^(\d{4})-(\d{2})/.exec(String(value ?? ""));
  if (!match) throw new Error(`${label} must be a month (YYYY-MM).`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}
