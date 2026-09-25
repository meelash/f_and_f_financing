/**
 * Monthly rent accounting.
 *
 * For each rent month, the agreed rent R is split like this:
 *
 *   R = taxReimbursement + reserveContribution + netRent
 *
 * - taxReimbursement goes back to the occupant for taxes/expenses they prepaid.
 * - reserveContribution is set aside in the partnership tax reserve.
 * - netRent is the dividend pool, split by ownership (as of the start of the rent month).
 *
 * Investors are paid their dividend first. Everything else the occupant pays (their own
 * dividend, their reimbursement, anything above rent) buys equity from the investors,
 * unless the occupant explicitly takes their dividend and/or reimbursement in cash.
 *
 * A rent month can have several entries (installments, a catch-up, an extra lump sum).
 * Each entry only owes what earlier entries for the same month have not already covered.
 */

export type OwnershipPosition = {
  membershipId: string;
  displayLabel: string;
  ownershipPct: number;
  isOccupant: boolean;
};

export type PaymentAmount =
  /** Everything the occupant put toward this entry, including reserve money and anything kept. */
  | { mode: "TOTAL"; amount: number }
  /** Only the cash that went to investors. */
  | { mode: "CASH_TO_INVESTORS"; amount: number };

/** What earlier entries for the same rent month already covered. */
export type PriorMonthEntries = {
  rentApplied: number;
  taxReimbursement: number;
  reserveContribution: number;
  occupantDividendTaken: number;
  dividendsPaid: Record<string, number>;
};

export type MonthlyPaymentInput = {
  agreedRent: number;
  propertyValuation: number;
  /** Ownership right now (as of the payment date). Equity purchases act on this. */
  ownerships: OwnershipPosition[];
  /** Ownership at the start of the rent month. Dividends are based on this. Defaults to `ownerships`. */
  monthStartOwnershipPct?: Record<string, number>;
  prior?: PriorMonthEntries;
  taxReimbursement: number;
  reserveContribution: number;
  payment: PaymentAmount;
  takeDividend?: boolean;
  takeReimbursement?: boolean;
};

export type ParticipantBreakdown = {
  membershipId: string;
  displayLabel: string;
  isOccupant: boolean;
  ownershipPctBefore: number;
  ownershipPctAfter: number;
  /** Investors: dividend received. Occupant: dividend taken in cash. */
  rentAmount: number;
  /** Investors: equity sold (positive). Occupant: equity bought (negative). */
  purchaseAmount: number;
};

export type MonthlyPaymentResult = {
  /** What a full, normal payment for the rest of this rent month looks like. */
  expected: {
    total: number;
    cashToInvestors: number;
    investorDividendsDue: number;
    occupantDividend: number;
    taxReimbursement: number;
    reserveContribution: number;
  };
  summary: {
    totalPaid: number;
    cashToInvestors: number;
    agreedRent: number;
    agreedRentApplied: number;
    netRent: number;
    investorDividends: number;
    dividendShortfall: number;
    taxReimbursement: number;
    reserveContribution: number;
    occupantDividendTaken: number;
    occupantRetained: number;
    ownershipPurchase: number;
    unappliedPurchase: number;
    valuation: number;
  };
  participants: ParticipantBreakdown[];
  notes: string[];
  warnings: string[];
};

const MONEY_FACTOR = 100;
const PCT_FACTOR = 1_000_000;

export function computeMonthlyPayment(input: MonthlyPaymentInput): MonthlyPaymentResult {
  const notes: string[] = [];
  const warnings: string[] = [];
  const ownerships = input.ownerships.filter(
    (position) => position.ownershipPct > 0 || position.isOccupant,
  );
  const occupant = ownerships.find((position) => position.isOccupant);
  const investors = ownerships.filter((position) => !position.isOccupant);

  if (!occupant) {
    throw new Error("Occupant membership is missing from the ownership set.");
  }
  if (!(input.agreedRent > 0)) {
    throw new Error("Agreed rent must be greater than 0.");
  }
  if (!(input.propertyValuation > 0)) {
    throw new Error("Property valuation must be greater than 0.");
  }
  if (!(input.payment.amount >= 0)) {
    throw new Error("Payment amount must be 0 or more.");
  }
  if (!(input.taxReimbursement >= 0) || !(input.reserveContribution >= 0)) {
    throw new Error("Tax reimbursement and reserve contribution must be 0 or more.");
  }

  const totalPct = ownerships.reduce((sum, position) => sum + position.ownershipPct, 0);
  if (Math.abs(totalPct - 100) > 0.01) {
    throw new Error(`Ownership must total 100%, received ${totalPct.toFixed(4)}%.`);
  }

  const prior = input.prior ?? emptyPrior();
  const monthStartPct = (membershipId: string) =>
    input.monthStartOwnershipPct?.[membershipId] ??
    ownerships.find((position) => position.membershipId === membershipId)?.ownershipPct ??
    0;

  // --- What this rent month owes, net of earlier entries -------------------------------
  const monthTaxItems = roundMoney(
    prior.taxReimbursement + prior.reserveContribution + input.taxReimbursement + input.reserveContribution,
  );
  if (monthTaxItems > input.agreedRent + 0.005) {
    throw new Error(
      `Tax reimbursement and reserve for this month (${monthTaxItems.toFixed(2)}) exceed the agreed rent.`,
    );
  }
  const netRent = roundMoney(input.agreedRent - monthTaxItems);

  const dividendDue = new Map<string, number>();
  for (const investor of investors) {
    const share = (monthStartPct(investor.membershipId) / 100) * netRent;
    const paid = prior.dividendsPaid[investor.membershipId] ?? 0;
    dividendDue.set(investor.membershipId, roundMoney(Math.max(0, share - paid)));
  }
  const investorDividendsDue = roundMoney(sum(dividendDue.values()));
  const occupantDividend = roundMoney(
    Math.max(0, (monthStartPct(occupant.membershipId) / 100) * netRent - prior.occupantDividendTaken),
  );

  const expectedTotal = roundMoney(
    investorDividendsDue + occupantDividend + input.taxReimbursement + input.reserveContribution,
  );
  const plannedKeep = roundMoney(
    (input.takeDividend ? occupantDividend : 0) + (input.takeReimbursement ? input.taxReimbursement : 0),
  );

  // --- Waterfall ------------------------------------------------------------------------
  // Investors' dividends always come first. In TOTAL mode, the reserve and whatever the
  // occupant keeps come out next, and the rest buys equity. In CASH_TO_INVESTORS mode the
  // reserve and kept amounts are separate money, so the whole amount goes to investors.
  let cashToInvestors: number;
  let reserveContribution: number;
  let occupantRetained: number;

  if (input.payment.mode === "TOTAL") {
    let remaining = roundMoney(input.payment.amount);
    const dividends = Math.min(remaining, investorDividendsDue);
    remaining = roundMoney(remaining - dividends);
    reserveContribution = roundMoney(Math.min(remaining, input.reserveContribution));
    remaining = roundMoney(remaining - reserveContribution);
    occupantRetained = roundMoney(Math.min(remaining, plannedKeep));
    remaining = roundMoney(remaining - occupantRetained);
    cashToInvestors = roundMoney(dividends + remaining);

    if (reserveContribution < input.reserveContribution) {
      warnings.push(
        `Only ${fmt(reserveContribution)} of the ${fmt(input.reserveContribution)} reserve contribution is covered by this payment.`,
      );
    }
  } else {
    cashToInvestors = roundMoney(input.payment.amount);
    reserveContribution = roundMoney(input.reserveContribution);
    occupantRetained = plannedKeep;
  }

  const investorDividends = roundMoney(Math.min(cashToInvestors, investorDividendsDue));
  const dividendShortfall = roundMoney(investorDividendsDue - investorDividends);
  const requestedPurchase = roundMoney(cashToInvestors - investorDividends);

  // The occupant's own portion covers their reimbursement first, then their dividend.
  const occupantPortion = roundMoney(requestedPurchase + occupantRetained);
  const taxReimbursement = roundMoney(Math.min(input.taxReimbursement, occupantPortion));
  const occupantDividendTaken = input.takeDividend
    ? roundMoney(
        Math.min(
          occupantDividend,
          Math.max(0, occupantRetained - (input.takeReimbursement ? taxReimbursement : 0)),
        ),
      )
    : 0;

  if (taxReimbursement < input.taxReimbursement) {
    warnings.push(
      `Only ${fmt(taxReimbursement)} of the ${fmt(input.taxReimbursement)} tax reimbursement is covered; the rest stays owed to the occupant.`,
    );
  }

  // --- Equity purchase ----------------------------------------------------------------------
  const availableEquity = roundMoney(
    (investors.reduce((total, position) => total + position.ownershipPct, 0) / 100) *
      input.propertyValuation,
  );
  const ownershipPurchase = roundMoney(Math.min(requestedPurchase, availableEquity));
  const unappliedPurchase = roundMoney(requestedPurchase - ownershipPurchase);
  if (unappliedPurchase > 0) {
    warnings.push(
      `${fmt(unappliedPurchase)} exceeds the equity the investors have left and was not applied.`,
    );
    cashToInvestors = roundMoney(cashToInvestors - unappliedPurchase);
  }

  const dividendSplit = allocateProRata(
    investorDividends,
    investors.map((position) => ({
      key: position.membershipId,
      weight: dividendDue.get(position.membershipId) ?? 0,
    })),
  );
  const purchaseSplit = allocateProRata(
    ownershipPurchase,
    investors.map((position) => ({ key: position.membershipId, weight: position.ownershipPct })),
  );
  const ownershipAfter = applyPurchases(ownerships, purchaseSplit, input.propertyValuation);

  const participants = ownerships.map(
    (position): ParticipantBreakdown => ({
      membershipId: position.membershipId,
      displayLabel: position.displayLabel,
      isOccupant: position.isOccupant,
      ownershipPctBefore: roundPct(position.ownershipPct),
      ownershipPctAfter: ownershipAfter.get(position.membershipId) ?? roundPct(position.ownershipPct),
      rentAmount: position.isOccupant
        ? occupantDividendTaken
        : dividendSplit.get(position.membershipId) ?? 0,
      purchaseAmount: position.isOccupant
        ? roundMoney(-ownershipPurchase)
        : purchaseSplit.get(position.membershipId) ?? 0,
    }),
  );

  // --- Notes ----------------------------------------------------------------------------
  if (dividendShortfall > 0) {
    warnings.push(
      `Investors are ${fmt(dividendShortfall)} short of their ${fmt(investorDividendsDue)} dividend for this month. ` +
        `A later entry for the same rent month will pay this first.`,
    );
  }
  if (occupantRetained > 0) {
    notes.push(`The occupant keeps ${fmt(occupantRetained)} in cash instead of buying equity.`);
  }
  if (investorDividendsDue === 0 && prior.rentApplied > 0) {
    notes.push("This month's dividends are already paid, so this whole entry buys equity.");
  }

  const totalPaid = roundMoney(cashToInvestors + reserveContribution + occupantRetained);
  const agreedRentApplied = roundMoney(
    Math.min(totalPaid, Math.max(0, input.agreedRent - prior.rentApplied)),
  );

  return {
    expected: {
      total: expectedTotal,
      cashToInvestors: roundMoney(expectedTotal - input.reserveContribution - plannedKeep),
      investorDividendsDue,
      occupantDividend,
      taxReimbursement: roundMoney(input.taxReimbursement),
      reserveContribution: roundMoney(input.reserveContribution),
    },
    summary: {
      totalPaid,
      cashToInvestors,
      agreedRent: roundMoney(input.agreedRent),
      agreedRentApplied,
      netRent,
      investorDividends,
      dividendShortfall,
      taxReimbursement,
      reserveContribution,
      occupantDividendTaken,
      occupantRetained,
      ownershipPurchase,
      unappliedPurchase,
      valuation: roundMoney(input.propertyValuation),
    },
    participants,
    notes,
    warnings,
  };
}

export function emptyPrior(): PriorMonthEntries {
  return {
    rentApplied: 0,
    taxReimbursement: 0,
    reserveContribution: 0,
    occupantDividendTaken: 0,
    dividendsPaid: {},
  };
}

/** Moves purchased equity from investors to the occupant; keeps the total at exactly 100%. */
function applyPurchases(
  ownerships: OwnershipPosition[],
  purchaseSplit: Map<string, number>,
  valuation: number,
) {
  const after = new Map<string, number>();
  for (const position of ownerships) {
    if (position.isOccupant) continue;
    const pctSold = ((purchaseSplit.get(position.membershipId) ?? 0) / valuation) * 100;
    after.set(position.membershipId, roundPct(Math.max(0, position.ownershipPct - pctSold)));
  }
  const occupant = ownerships.find((position) => position.isOccupant)!;
  // The occupant gets everything the investors no longer hold, which also absorbs rounding.
  after.set(occupant.membershipId, roundPct(100 - sum(after.values())));
  return after;
}

/** Splits `total` by weight in whole cents, handing leftover cents to the largest remainders. */
export function allocateProRata(total: number, items: Array<{ key: string; weight: number }>) {
  const allocations = new Map<string, number>(items.map((item) => [item.key, 0]));
  const weighted = items.filter((item) => item.weight > 0);
  if (total <= 0 || weighted.length === 0) return allocations;

  const totalUnits = Math.round(total * MONEY_FACTOR);
  const totalWeight = weighted.reduce((acc, item) => acc + item.weight, 0);
  const parts = weighted.map((item) => {
    const raw = (totalUnits * item.weight) / totalWeight;
    return { key: item.key, units: Math.floor(raw), remainder: raw - Math.floor(raw) };
  });
  let leftover = totalUnits - parts.reduce((acc, part) => acc + part.units, 0);
  for (const part of [...parts].sort((a, b) => b.remainder - a.remainder)) {
    if (leftover <= 0) break;
    part.units += 1;
    leftover -= 1;
  }
  for (const part of parts) allocations.set(part.key, part.units / MONEY_FACTOR);
  return allocations;
}

function sum(values: Iterable<number>) {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

function fmt(value: number) {
  return `$${value.toFixed(2)}`;
}

export function roundMoney(value: number) {
  return Math.round(value * MONEY_FACTOR) / MONEY_FACTOR;
}

export function roundPct(value: number) {
  return Math.round(value * PCT_FACTOR) / PCT_FACTOR;
}
