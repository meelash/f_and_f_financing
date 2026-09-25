import {
  computeMonthlyPayment,
  roundMoney,
  type OwnershipPosition,
} from "@/lib/accounting/monthly-payment";
import { addMonths, monthStart } from "@/lib/accounting/tax";

export type ProjectionInput = {
  startMonth: Date;
  /** Total the occupant pays each month (same meaning as a TOTAL-mode rent entry). */
  monthlyTotalPaid: number;
  agreedRent: number;
  propertyValuation: number;
  ownerships: OwnershipPosition[];
  /**
   * Expected monthly tax. OUT_OF_POCKET: the occupant pays tax bills and is reimbursed
   * this much from rent each month. RESERVE: this much goes into the reserve each month.
   */
  monthlyTax?: { mode: "OUT_OF_POCKET" | "RESERVE"; amount: number } | null;
  maxMonths?: number;
};

export type ProjectionMonth = {
  month: string;
  ownershipPctBefore: Record<string, number>;
  ownershipPctAfter: Record<string, number>;
  /** Dividends paid to each investor. */
  dividends: Record<string, number>;
  /** Equity each investor sold to the occupant. */
  purchases: Record<string, number>;
  investorDividends: number;
  ownershipPurchase: number;
  taxReimbursement: number;
  reserveContribution: number;
};

export type ProjectionResult = {
  completed: boolean;
  buyoutMonth: string | null;
  monthsSimulated: number;
  totalInvestorDividends: number;
  totalOwnershipPurchase: number;
  history: ProjectionMonth[];
};

/** Runs the real monthly engine forward, one rent month at a time, until investors hold nothing. */
export function projectBuyoutTimeline(input: ProjectionInput): ProjectionResult {
  const maxMonths = input.maxMonths ?? 480;
  const history: ProjectionMonth[] = [];
  let ownerships = input.ownerships.map((position) => ({ ...position }));
  let month = monthStart(input.startMonth);
  let totalInvestorDividends = 0;
  let totalOwnershipPurchase = 0;

  const monthlyTaxAmount = Math.min(input.monthlyTax?.amount ?? 0, input.agreedRent);
  const taxReimbursement = input.monthlyTax?.mode === "OUT_OF_POCKET" ? monthlyTaxAmount : 0;
  const reserveContribution = input.monthlyTax?.mode === "RESERVE" ? monthlyTaxAmount : 0;

  for (let i = 0; i < maxMonths; i += 1) {
    const result = computeMonthlyPayment({
      agreedRent: input.agreedRent,
      propertyValuation: input.propertyValuation,
      ownerships,
      taxReimbursement,
      reserveContribution,
      payment: { mode: "TOTAL", amount: input.monthlyTotalPaid },
    });

    const investors = result.participants.filter((participant) => !participant.isOccupant);
    history.push({
      month: month.toISOString().slice(0, 10),
      ownershipPctBefore: byMember(result.participants, (participant) => participant.ownershipPctBefore),
      ownershipPctAfter: byMember(result.participants, (participant) => participant.ownershipPctAfter),
      dividends: byMember(investors, (participant) => participant.rentAmount),
      purchases: byMember(investors, (participant) => participant.purchaseAmount),
      investorDividends: result.summary.investorDividends,
      ownershipPurchase: result.summary.ownershipPurchase,
      taxReimbursement: result.summary.taxReimbursement,
      reserveContribution: result.summary.reserveContribution,
    });
    totalInvestorDividends = roundMoney(totalInvestorDividends + result.summary.investorDividends);
    totalOwnershipPurchase = roundMoney(totalOwnershipPurchase + result.summary.ownershipPurchase);

    ownerships = ownerships.map((position) => ({
      ...position,
      ownershipPct:
        result.participants.find((participant) => participant.membershipId === position.membershipId)
          ?.ownershipPctAfter ?? position.ownershipPct,
    }));

    const investorsLeft = ownerships
      .filter((position) => !position.isOccupant)
      .reduce((sum, position) => sum + position.ownershipPct, 0);
    if (investorsLeft <= 0.000001) {
      return {
        completed: true,
        buyoutMonth: history.at(-1)!.month,
        monthsSimulated: i + 1,
        totalInvestorDividends,
        totalOwnershipPurchase,
        history,
      };
    }
    // Paying only the dividend (or less) never buys anything, so it will never finish.
    if (result.summary.ownershipPurchase <= 0) break;

    month = addMonths(month, 1);
  }

  return {
    completed: false,
    buyoutMonth: null,
    monthsSimulated: history.length,
    totalInvestorDividends,
    totalOwnershipPurchase,
    history,
  };
}

function byMember<T extends { membershipId: string }>(items: T[], pick: (item: T) => number) {
  return Object.fromEntries(items.map((item) => [item.membershipId, pick(item)]));
}
