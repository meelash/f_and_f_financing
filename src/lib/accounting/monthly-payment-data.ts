import { prisma } from "@/lib/prisma";

export type PartnershipMonthlyData = {
  partnershipId: string;
  paymentMonth: Date;
  occupantMembershipId: string;
  agreedRent: number;
  valuation: number;
  ownerships: Array<{
    membershipId: string;
    displayLabel: string;
    ownershipPct: number;
    isOccupant: boolean;
  }>;
  taxSchedules: Array<{
    paidByMembershipId: string;
    reimbursementStart: Date;
    coverageMonths: number;
    monthlyAmount: number;
  }>;
  membershipNameById: Map<string, string>;
};

export async function getPartnershipMonthlyData(input: {
  partnershipId: string;
  occupantMembershipId: string;
  paymentMonth: Date;
  agreedRentOverride?: number;
  valuationOverride?: number;
}) {
  const partnership = await prisma.partnership.findUnique({
    where: { id: input.partnershipId },
    include: {
      properties: true,
      memberships: {
        include: {
          user: true,
        },
      },
      monthlyPolicies: true,
      taxPayments: true,
    },
  });

  if (!partnership) {
    throw new Error("Partnership not found.");
  }

  const occupantMembership = partnership.memberships.find(
    (membership) => membership.id === input.occupantMembershipId,
  );

  if (!occupantMembership) {
    throw new Error("Occupant membership does not belong to the selected partnership.");
  }

  const effectivePolicy = pickEffectivePolicy(partnership.monthlyPolicies, input.paymentMonth);
  const property = partnership.properties[0];

  const valuation =
    input.valuationOverride ??
    decimalToNumber(property?.currentValuation) ??
    decimalToNumber(property?.initialValuation);

  if (!valuation) {
    throw new Error("Property valuation is required before previewing monthly payments.");
  }

  const ownershipSnapshots = await prisma.ownershipSnapshot.findMany({
    where: {
      partnershipId: input.partnershipId,
      asOf: {
        lte: input.paymentMonth,
      },
    },
    orderBy: [{ asOf: "desc" }],
  });

  const latestSnapshotByMembership = new Map<string, number>();
  for (const snapshot of ownershipSnapshots) {
    if (!latestSnapshotByMembership.has(snapshot.membershipId)) {
      latestSnapshotByMembership.set(
        snapshot.membershipId,
        requiredNumber(snapshot.ownershipPct, "ownership snapshot percentage"),
      );
    }
  }

  const ownerships = partnership.memberships.map((membership) => ({
    membershipId: membership.id,
    displayLabel: membership.displayLabel || membership.user.fullName,
    ownershipPct:
      latestSnapshotByMembership.get(membership.id) ??
      requiredNumber(membership.initialOwnershipPct, "initial ownership percentage"),
    isOccupant: membership.id === input.occupantMembershipId,
  }));

  const policyPayments = partnership.taxPayments
    .filter((payment) => (payment.note ?? "").startsWith("[POLICY]"))
    .filter((payment) => payment.reimbursementStart <= input.paymentMonth)
    .sort(
      (left, right) => {
        const startDelta =
          right.reimbursementStart.getTime() - left.reimbursementStart.getTime();
        if (startDelta !== 0) {
          return startDelta;
        }
        return right.createdAt.getTime() - left.createdAt.getTime();
      },
    );

  const activePolicy = policyPayments[0];
  const policyMode = activePolicy
    ? (activePolicy.note ?? "").includes("mode=RESERVE")
      ? "RESERVE"
      : "OUT_OF_POCKET"
    : null;

  const taxSchedules = activePolicy
    ? [
        {
          paidByMembershipId: input.occupantMembershipId,
          reimbursementStart: activePolicy.reimbursementStart,
          coverageMonths: activePolicy.coverageMonths,
          monthlyAmount:
            policyMode === "RESERVE"
              ? -roundMoney(
                  requiredNumber(activePolicy.amount, "tax policy amount") /
                    activePolicy.coverageMonths,
                )
              : roundMoney(
                  requiredNumber(activePolicy.amount, "tax policy amount") /
                    activePolicy.coverageMonths,
                ),
        },
      ]
    : partnership.taxPayments
        .filter((payment) => payment.paidByMembershipId === input.occupantMembershipId)
        .filter((payment) => !(payment.note ?? "").startsWith("[OUT_OF_POCKET_PAYMENT]"))
        .map((payment) => ({
          paidByMembershipId: payment.paidByMembershipId ?? input.occupantMembershipId,
          reimbursementStart: payment.reimbursementStart,
          coverageMonths: payment.coverageMonths,
          monthlyAmount: roundMoney(
            requiredNumber(payment.amount, "tax payment amount") / payment.coverageMonths,
          ),
        }));

  const membershipNameById = new Map<string, string>();
  for (const membership of partnership.memberships) {
    membershipNameById.set(
      membership.id,
      membership.displayLabel || membership.user.fullName,
    );
  }

  return {
    partnershipId: partnership.id,
    paymentMonth: input.paymentMonth,
    occupantMembershipId: input.occupantMembershipId,
    agreedRent:
      input.agreedRentOverride ??
      requiredNumber(effectivePolicy.agreedRent, "effective monthly rent"),
    valuation,
    ownerships,
    taxSchedules,
    membershipNameById,
  } satisfies PartnershipMonthlyData;
}

function pickEffectivePolicy(
  policies: Array<{
    effectiveFrom: Date;
    effectiveTo: Date | null;
    agreedRent: unknown;
  }>,
  paymentMonth: Date,
) {
  const effective = policies
    .filter((policy) => policy.effectiveFrom <= paymentMonth)
    .filter((policy) => !policy.effectiveTo || policy.effectiveTo >= paymentMonth)
    .sort((left, right) => right.effectiveFrom.getTime() - left.effectiveFrom.getTime())[0];

  if (!effective) {
    throw new Error("No effective monthly rent policy exists for the selected month.");
  }

  return effective;
}

function decimalToNumber(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }

  return Number(value);
}

function requiredNumber(value: unknown, label: string) {
  const parsed = decimalToNumber(value);

  if (parsed === undefined) {
    throw new Error(`${label} is missing.`);
  }

  return parsed;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
