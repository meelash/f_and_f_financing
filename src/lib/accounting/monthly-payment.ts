export type OwnershipPosition = {
  membershipId: string;
  displayLabel: string;
  ownershipPct: number;
  isOccupant: boolean;
};

export type TaxReimbursementSchedule = {
  paidByMembershipId?: string | null;
  reimbursementStart: Date;
  coverageMonths: number;
  monthlyAmount: number;
};

export type MonthlyPaymentPreviewInput = {
  paymentMonth: Date;
  totalPaid: number;
  agreedRent: number;
  propertyValuation: number;
  manualReimbursement?: number;
  occupantMembershipId: string;
  ownerships: OwnershipPosition[];
  taxSchedules: TaxReimbursementSchedule[];
  expenseSchedules?: TaxReimbursementSchedule[];
};

export type ParticipantBreakdown = {
  membershipId: string;
  displayLabel: string;
  isOccupant: boolean;
  ownershipPctBefore: number;
  ownershipPctAfter: number;
  rentAmount: number;
  purchaseAmount: number;
};

export type MonthlyPaymentPreview = {
  summary: {
    paymentMonth: string;
    totalPaid: number;
    agreedRent: number;
    agreedRentApplied: number;
    extraPayment: number;
    reimbursementAdjustments: number;
    taxReimbursement: number;
    netRentForSplit: number;
    rentDistributionTotal: number;
    occupantRentShare: number;
    requestedPurchaseAmount: number;
    appliedPurchaseAmount: number;
    unappliedPurchaseAmount: number;
    partnershipBalanceIncrease: number;
    estimatedValuationUsed: number;
    cashPaidToOtherPartners: number;
  };
  participants: ParticipantBreakdown[];
  warnings: string[];
};

const MONEY_FACTOR = 100;
const OWNERSHIP_FACTOR = 10_000;

export function computeMonthlyPaymentPreview(
  input: MonthlyPaymentPreviewInput,
): MonthlyPaymentPreview {
  const warnings: string[] = [];
  const ownerships = input.ownerships.filter((position) => position.ownershipPct > 0);
  const occupant = ownerships.find(
    (position) => position.membershipId === input.occupantMembershipId,
  );

  if (!occupant) {
    throw new Error("Occupant membership is missing from the ownership set.");
  }

  if (input.totalPaid <= 0) {
    throw new Error("totalPaid must be greater than 0.");
  }

  if (input.agreedRent <= 0) {
    throw new Error("agreedRent must be greater than 0.");
  }

  if (input.propertyValuation <= 0) {
    throw new Error("propertyValuation must be greater than 0.");
  }

  const totalOwnershipPct = roundPct(
    ownerships.reduce((sum, position) => sum + position.ownershipPct, 0),
  );

  if (Math.abs(totalOwnershipPct - 100) > 0.01) {
    throw new Error(`Ownership must total 100.00%, received ${totalOwnershipPct.toFixed(4)}%.`);
  }

  const agreedRentApplied = roundMoney(Math.min(input.totalPaid, input.agreedRent));
  const extraPayment = roundMoney(input.totalPaid - agreedRentApplied);

  if (input.totalPaid < input.agreedRent) {
    warnings.push("Payment is below the agreed rent amount for this month.");
  }

  const requestedTaxFromSchedules = roundMoney(
    input.taxSchedules
      .filter((schedule) => monthIsCovered(input.paymentMonth, schedule))
      .reduce((sum, schedule) => sum + schedule.monthlyAmount, 0),
  );

  const requestedExpenseAdjustments = roundMoney(
    (input.expenseSchedules ?? [])
      .filter((schedule) => monthIsCovered(input.paymentMonth, schedule))
      .reduce((sum, schedule) => sum + schedule.monthlyAmount, 0),
  );

  const requestedTotalAdjustment =
    typeof input.manualReimbursement === "number" && Number.isFinite(input.manualReimbursement)
      ? roundMoney(input.manualReimbursement)
      : roundMoney(requestedTaxFromSchedules + requestedExpenseAdjustments);

  const taxReimbursement = roundMoney(
    Math.max(-agreedRentApplied, Math.min(requestedTotalAdjustment, agreedRentApplied)),
  );

  if (requestedTotalAdjustment > agreedRentApplied) {
    warnings.push("Reimbursement adjustments exceeded applied rent and were capped to the rent amount.");
  }

  if (requestedTotalAdjustment < -agreedRentApplied) {
    warnings.push("Negative reimbursement adjustments exceeded applied rent and were capped.");
  }

  const absoluteTaxAdjustment = roundMoney(Math.abs(taxReimbursement));
  const netRentForSplit = roundMoney(agreedRentApplied - absoluteTaxAdjustment);
  const rentDistribution = allocateProRata(
    netRentForSplit,
    ownerships.map((position) => ({
      key: position.membershipId,
      weight: position.ownershipPct,
    })),
    MONEY_FACTOR,
  );

  const occupantRentShare = rentDistribution.get(input.occupantMembershipId) ?? 0;
  const positiveTaxReimbursement = roundMoney(Math.max(0, taxReimbursement));
  const requestedPurchaseAmount = roundMoney(
    extraPayment + occupantRentShare + positiveTaxReimbursement,
  );
  const partnershipBalanceIncrease = roundMoney(
    taxReimbursement < 0 ? Math.abs(taxReimbursement) : 0,
  );

  const sellerPositions = ownerships.filter((position) => !position.isOccupant);
  const sellerOwnershipPct = sellerPositions.reduce(
    (sum, position) => sum + position.ownershipPct,
    0,
  );
  const availableSellerEquityValue = roundMoney(
    (sellerOwnershipPct / 100) * input.propertyValuation,
  );
  const appliedPurchaseAmount = roundMoney(
    Math.min(requestedPurchaseAmount, availableSellerEquityValue),
  );
  const unappliedPurchaseAmount = roundMoney(
    requestedPurchaseAmount - appliedPurchaseAmount,
  );

  if (unappliedPurchaseAmount > 0) {
    warnings.push(
      "Requested ownership purchase exceeds available seller equity and was partially capped.",
    );
  }

  const purchaseDistribution = allocateProRata(
    appliedPurchaseAmount,
    sellerPositions.map((position) => ({
      key: position.membershipId,
      weight: position.ownershipPct,
    })),
    MONEY_FACTOR,
  );

  const ownershipAfter = buildOwnershipAfterMap(
    ownerships,
    input.propertyValuation,
    purchaseDistribution,
    input.occupantMembershipId,
  );

  const participants = ownerships.map((position) => {
    const rentAmount = roundMoney(rentDistribution.get(position.membershipId) ?? 0);
    const purchaseAmount = position.isOccupant
      ? roundMoney(-appliedPurchaseAmount)
      : roundMoney(purchaseDistribution.get(position.membershipId) ?? 0);

    return {
      membershipId: position.membershipId,
      displayLabel: position.displayLabel,
      isOccupant: position.isOccupant,
      ownershipPctBefore: roundPct(position.ownershipPct),
      ownershipPctAfter: roundPct(ownershipAfter.get(position.membershipId) ?? position.ownershipPct),
      rentAmount,
      purchaseAmount,
    } satisfies ParticipantBreakdown;
  });

  const cashPaidToOtherPartners = roundMoney(
    participants
      .filter((participant) => !participant.isOccupant)
      .reduce(
        (sum, participant) => sum + participant.rentAmount + participant.purchaseAmount,
        0,
      ),
  );

  return {
    summary: {
      paymentMonth: toMonthStartIso(input.paymentMonth),
      totalPaid: roundMoney(input.totalPaid),
      agreedRent: roundMoney(input.agreedRent),
      agreedRentApplied,
      extraPayment,
      reimbursementAdjustments: taxReimbursement,
      taxReimbursement,
      netRentForSplit,
      rentDistributionTotal: netRentForSplit,
      occupantRentShare,
      requestedPurchaseAmount,
      appliedPurchaseAmount,
      unappliedPurchaseAmount,
      partnershipBalanceIncrease,
      estimatedValuationUsed: roundMoney(input.propertyValuation),
      cashPaidToOtherPartners,
    },
    participants,
    warnings,
  };
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
  const endIndex = startIndex + schedule.coverageMonths - 1;
  return paymentIndex >= startIndex && paymentIndex <= endIndex;
}

function monthIndex(date: Date) {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function toMonthStartIso(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function roundMoney(value: number) {
  return Math.round(value * MONEY_FACTOR) / MONEY_FACTOR;
}

function roundPct(value: number) {
  return Math.round(value * OWNERSHIP_FACTOR) / OWNERSHIP_FACTOR;
}
