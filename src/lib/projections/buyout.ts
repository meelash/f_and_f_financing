import {
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
    agreedRentApplied: number;
    sharedTaxAmount: number;
    rentForDividend: number;
    extraAfterRent: number;
    partnerOwnershipPct: number;
    occupantOwnershipPct: number;
    ownershipPctBeforeByMembership: Record<string, number>;
    ownershipPctAfterByMembership: Record<string, number>;
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
    const ownershipPctBeforeByMembership = Object.fromEntries(
      ownerships.map((position) => [position.membershipId, roundPct(position.ownershipPct)]),
    );

    const agreedRentApplied = roundMoney(Math.min(input.monthlyTotalPaid, input.agreedRent));
    const extraAfterRent = roundMoney(input.monthlyTotalPaid - agreedRentApplied);
    const sharedTaxAmount = roundMoney(
      input.taxSchedules
        .filter((schedule) => monthIsCovered(month, schedule))
        .reduce((sum, schedule) => sum + Math.abs(schedule.monthlyAmount), 0),
    );
    const taxAppliedToRent = roundMoney(Math.min(agreedRentApplied, sharedTaxAmount));
    const rentForDividend = roundMoney(agreedRentApplied - taxAppliedToRent);

    const rentDistribution = allocateProRata(
      rentForDividend,
      ownerships.map((position) => ({
        key: position.membershipId,
        weight: position.ownershipPct,
      })),
      100,
    );

    const partnerRent = roundMoney(
      ownerships
        .filter((position) => !position.isOccupant)
        .reduce((sum, position) => sum + (rentDistribution.get(position.membershipId) ?? 0), 0),
    );

    const sellerPositions = ownerships.filter((position) => !position.isOccupant);
    const sellerOwnershipPct = sellerPositions.reduce(
      (sum, position) => sum + position.ownershipPct,
      0,
    );
    const availableSellerEquityValue = roundMoney(
      (sellerOwnershipPct / 100) * input.propertyValuation,
    );
    const requestedPurchaseAmount = roundMoney(extraAfterRent + partnerRent);
    const appliedPurchaseAmount = roundMoney(
      Math.min(requestedPurchaseAmount, availableSellerEquityValue),
    );

    const purchaseDistribution = allocateProRata(
      appliedPurchaseAmount,
      sellerPositions.map((position) => ({
        key: position.membershipId,
        weight: position.ownershipPct,
      })),
      100,
    );

    const ownershipAfter = buildOwnershipAfterMap(
      ownerships,
      input.propertyValuation,
      purchaseDistribution,
      input.occupantMembershipId,
    );

    const occupantOwnershipPct = roundPct(
      ownershipAfter.get(input.occupantMembershipId) ?? 0,
    );
    const ownershipPctAfterByMembership = Object.fromEntries(
      ownerships.map((position) => [
        position.membershipId,
        roundPct(ownershipAfter.get(position.membershipId) ?? position.ownershipPct),
      ]),
    );
    const partnerOwnershipPct = roundPct(
      ownerships
        .filter((position) => !position.isOccupant)
        .reduce(
          (sum, position) => sum + (ownershipAfter.get(position.membershipId) ?? 0),
          0,
        ),
    );

    totalPartnerDividendRent = roundMoney(totalPartnerDividendRent + partnerRent);
    totalOwnershipPurchase = roundMoney(totalOwnershipPurchase + appliedPurchaseAmount);

    history.push({
      month: month.toISOString().slice(0, 10),
      ownershipPurchase: appliedPurchaseAmount,
      partnerRent,
      agreedRentApplied,
      sharedTaxAmount: taxAppliedToRent,
      rentForDividend,
      extraAfterRent,
      partnerOwnershipPct,
      occupantOwnershipPct,
      ownershipPctBeforeByMembership,
      ownershipPctAfterByMembership,
    });

    ownerships = ownerships.map((position) => ({
      membershipId: position.membershipId,
      displayLabel: position.displayLabel,
      ownershipPct: roundPct(ownershipAfter.get(position.membershipId) ?? position.ownershipPct),
      isOccupant: position.isOccupant,
    }));

    if (partnerOwnershipPct <= 0.000001) {
      return {
        completed: true,
        buyoutMonth: month.toISOString().slice(0, 10),
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

function buildOwnershipAfterMap(
  ownerships: OwnershipPosition[],
  propertyValuation: number,
  purchaseDistribution: Map<string, number>,
  occupantMembershipId: string,
) {
  const exactAfter = new Map<string, number>();

  for (const position of ownerships) {
    if (position.membershipId === occupantMembershipId) {
      continue;
    }

    const purchaseAmount = purchaseDistribution.get(position.membershipId) ?? 0;
    const pctSold = (purchaseAmount / propertyValuation) * 100;
    exactAfter.set(position.membershipId, position.ownershipPct - pctSold);
  }

  const occupantBefore = ownerships.find(
    (position) => position.membershipId === occupantMembershipId,
  )?.ownershipPct;

  if (occupantBefore === undefined) {
    throw new Error("Occupant membership could not be resolved.");
  }

  const totalTransferredPct = Array.from(purchaseDistribution.values()).reduce(
    (sum, purchaseAmount) => sum + (purchaseAmount / propertyValuation) * 100,
    0,
  );
  exactAfter.set(occupantMembershipId, occupantBefore + totalTransferredPct);

  const rounded = new Map<string, number>();
  for (const position of ownerships) {
    rounded.set(
      position.membershipId,
      roundPct(exactAfter.get(position.membershipId) ?? position.ownershipPct),
    );
  }

  const totalRounded = Array.from(rounded.values()).reduce((sum, value) => sum + value, 0);
  const diff = roundPct(100 - totalRounded);
  rounded.set(
    occupantMembershipId,
    roundPct((rounded.get(occupantMembershipId) ?? 0) + diff),
  );

  return rounded;
}

function allocateProRata(
  total: number,
  items: Array<{ key: string; weight: number }>,
  factor: number,
) {
  const allocations = new Map<string, number>();
  const filteredItems = items.filter((item) => item.weight > 0);

  for (const item of items) {
    allocations.set(item.key, 0);
  }

  if (total <= 0 || filteredItems.length === 0) {
    return allocations;
  }

  const totalUnits = Math.round(total * factor);
  const totalWeight = filteredItems.reduce((sum, item) => sum + item.weight, 0);
  const remainders = filteredItems.map((item) => {
    const rawUnits = (totalUnits * item.weight) / totalWeight;
    const baseUnits = Math.floor(rawUnits);
    return {
      key: item.key,
      baseUnits,
      remainder: rawUnits - baseUnits,
    };
  });

  let distributedUnits = remainders.reduce((sum, item) => sum + item.baseUnits, 0);
  remainders.sort((left, right) => right.remainder - left.remainder);

  for (const item of remainders) {
    let nextUnits = item.baseUnits;
    if (distributedUnits < totalUnits) {
      nextUnits += 1;
      distributedUnits += 1;
    }
    allocations.set(item.key, nextUnits / factor);
  }

  return allocations;
}

function monthIsCovered(paymentMonth: Date, schedule: TaxReimbursementSchedule) {
  const paymentIndex = monthIndex(paymentMonth);
  const startIndex = monthIndex(schedule.reimbursementStart);
  if (paymentIndex < startIndex) {
    return false;
  }

  if (schedule.recurrence === "RECURRING") {
    return true;
  }

  const endIndex = startIndex + schedule.coverageMonths - 1;
  return paymentIndex <= endIndex;
}

function monthIndex(date: Date) {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
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
