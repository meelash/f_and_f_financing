import {
  computeMonthlyPaymentPreview,
  type MonthlyPaymentPreview,
  type OwnershipPosition,
  type TaxReimbursementSchedule,
} from "@/lib/accounting/monthly-payment";

export type ProjectionInput = {
  startMonth: Date;
  monthlyTotalPaid: number;
  agreedRent: number;
  propertyValuation: number;
  occupantMembershipId: string;
  ownerships: OwnershipPosition[];
  taxSchedules: TaxReimbursementSchedule[];
  maxMonths?: number;
};

export type ProjectionResult = {
  completed: boolean;
  buyoutMonth: string | null;
  monthsSimulated: number;
  totalPartnerDividendRent: number;
  totalOwnershipPurchase: number;
  history: Array<{
    month: string;
    ownershipPurchase: number;
    partnerRent: number;
    partnerOwnershipPct: number;
    occupantOwnershipPct: number;
  }>;
};

export function projectBuyoutTimeline(input: ProjectionInput): ProjectionResult {
  const maxMonths = input.maxMonths ?? 480;
  const history: ProjectionResult["history"] = [];

  let ownerships = cloneOwnerships(input.ownerships);
  let month = new Date(Date.UTC(input.startMonth.getUTCFullYear(), input.startMonth.getUTCMonth(), 1));
  let totalPartnerDividendRent = 0;
  let totalOwnershipPurchase = 0;

  for (let i = 0; i < maxMonths; i += 1) {
    const preview: MonthlyPaymentPreview = computeMonthlyPaymentPreview({
      paymentMonth: month,
      totalPaid: input.monthlyTotalPaid,
      agreedRent: input.agreedRent,
      propertyValuation: input.propertyValuation,
      occupantMembershipId: input.occupantMembershipId,
      ownerships,
      taxSchedules: input.taxSchedules,
    });

    const partnerParticipants = preview.participants.filter((participant) => !participant.isOccupant);
    const partnerRent = roundMoney(
      partnerParticipants.reduce((sum, participant) => sum + participant.rentAmount, 0),
    );

    totalPartnerDividendRent = roundMoney(totalPartnerDividendRent + partnerRent);
    totalOwnershipPurchase = roundMoney(
      totalOwnershipPurchase + preview.summary.appliedPurchaseAmount,
    );

    const occupantAfter = preview.participants.find((participant) => participant.isOccupant);
    const combinedPartnerAfter = roundPct(
      partnerParticipants.reduce((sum, participant) => sum + participant.ownershipPctAfter, 0),
    );

    history.push({
      month: preview.summary.paymentMonth,
      ownershipPurchase: preview.summary.appliedPurchaseAmount,
      partnerRent,
      partnerOwnershipPct: combinedPartnerAfter,
      occupantOwnershipPct: occupantAfter?.ownershipPctAfter ?? 0,
    });

    ownerships = preview.participants.map((participant) => ({
      membershipId: participant.membershipId,
      displayLabel: participant.displayLabel,
      ownershipPct: participant.ownershipPctAfter,
      isOccupant: participant.isOccupant,
    }));

    if (combinedPartnerAfter <= 0.000001) {
      return {
        completed: true,
        buyoutMonth: preview.summary.paymentMonth,
        monthsSimulated: i + 1,
        totalPartnerDividendRent,
        totalOwnershipPurchase,
        history,
      };
    }

    month = nextMonth(month);
  }

  return {
    completed: false,
    buyoutMonth: null,
    monthsSimulated: maxMonths,
    totalPartnerDividendRent,
    totalOwnershipPurchase,
    history,
  };
}

function cloneOwnerships(ownerships: OwnershipPosition[]) {
  return ownerships.map((ownership) => ({ ...ownership }));
}

function nextMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number) {
  return Math.round(value * 10000) / 10000;
}
