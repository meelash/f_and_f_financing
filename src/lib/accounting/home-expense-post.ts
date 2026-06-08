import { prisma } from "@/lib/prisma";

export type CreateHomeExpenseInput = {
  partnershipId: string;
  occupantMembershipId: string;
  amount: number;
  incurredOn: string;
  treatment: "AMORTIZE_OFFSET" | "VALUATION_DILUTION";
  amortizationMonths?: number;
  note?: string;
  actorUserId?: string;
};

export async function createHomeExpenseAndEffects(input: CreateHomeExpenseInput) {
  if (input.amount <= 0 || Number.isNaN(input.amount)) {
    throw new Error("amount must be greater than 0.");
  }

  const incurredOn = parseDateInput(input.incurredOn, "incurredOn");

  if (input.treatment === "AMORTIZE_OFFSET") {
    const months = input.amortizationMonths ?? 0;
    if (!Number.isInteger(months) || months <= 0) {
      throw new Error("amortizationMonths must be a positive integer for AMORTIZE_OFFSET.");
    }

    return prisma.$transaction(async (tx) => {
      const expense = await tx.homeExpense.create({
        data: {
          partnershipId: input.partnershipId,
          paidByMembershipId: input.occupantMembershipId,
          amount: input.amount,
          incurredOn,
          treatment: "AMORTIZE_OFFSET",
          amortizationMonths: months,
          offsetStartMonth: toUtcMonthStart(incurredOn),
          note: input.note,
        },
      });

      await tx.auditLog.create({
        data: {
          partnershipId: input.partnershipId,
          actorId: input.actorUserId,
          entityType: "HOME_EXPENSE",
          entityId: expense.id,
          action: "CREATE",
          afterData: {
            treatment: "AMORTIZE_OFFSET",
            amount: input.amount,
            incurredOn: incurredOn.toISOString(),
            amortizationMonths: months,
          },
        },
      });

      return {
        expenseId: expense.id,
        entryType: "EXPENSE" as const,
      };
    });
  }

  return prisma.$transaction(async (tx) => {
    const partnership = await tx.partnership.findUnique({
      where: { id: input.partnershipId },
      include: {
        properties: true,
        memberships: {
          where: { isActive: true },
          include: { user: true },
        },
      },
    });

    if (!partnership) {
      throw new Error("Partnership not found.");
    }

    const property = partnership.properties[0];
    if (!property) {
      throw new Error("Property is required before posting a valuation dilution expense.");
    }

    const valuationBefore = Number(property.currentValuation ?? property.initialValuation ?? 0);
    if (!valuationBefore || valuationBefore <= 0) {
      throw new Error("Current valuation is required before posting a valuation dilution expense.");
    }

    const membershipIds = partnership.memberships.map((membership) => membership.id);
    const ownershipSnapshots = await tx.ownershipSnapshot.findMany({
      where: {
        partnershipId: input.partnershipId,
        membershipId: { in: membershipIds },
        asOf: { lte: incurredOn },
      },
      orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
    });

    const latestPctByMembership = new Map<string, number>();
    for (const snapshot of ownershipSnapshots) {
      if (!latestPctByMembership.has(snapshot.membershipId)) {
        latestPctByMembership.set(snapshot.membershipId, Number(snapshot.ownershipPct));
      }
    }

    const occupantMembership = partnership.memberships.find(
      (membership) => membership.id === input.occupantMembershipId,
    );

    if (!occupantMembership) {
      throw new Error("Occupant membership does not belong to the selected partnership.");
    }

    const ownershipBefore = partnership.memberships.map((membership) => ({
      membershipId: membership.id,
      ownershipPct:
        latestPctByMembership.get(membership.id) ?? Number(membership.initialOwnershipPct),
    }));

    const valuationAfter = roundMoney(valuationBefore + input.amount);
    const ownershipAfter = ownershipBefore.map((position) => {
      const equityBefore = (position.ownershipPct / 100) * valuationBefore;
      const occupantEquityTopUp =
        position.membershipId === input.occupantMembershipId ? input.amount : 0;
      const ownershipPctAfter = ((equityBefore + occupantEquityTopUp) / valuationAfter) * 100;

      return {
        membershipId: position.membershipId,
        ownershipPctBefore: roundPct(position.ownershipPct),
        ownershipPctAfter: roundPct(ownershipPctAfter),
      };
    });

    const roundedTotal = ownershipAfter.reduce(
      (sum, position) => sum + position.ownershipPctAfter,
      0,
    );
    const balancingDiff = roundPct(100 - roundedTotal);
    const occupantAfter = ownershipAfter.find(
      (position) => position.membershipId === input.occupantMembershipId,
    );

    if (occupantAfter) {
      occupantAfter.ownershipPctAfter = roundPct(
        occupantAfter.ownershipPctAfter + balancingDiff,
      );
    }

    const expense = await tx.homeExpense.create({
      data: {
        partnershipId: input.partnershipId,
        propertyId: property.id,
        paidByMembershipId: input.occupantMembershipId,
        amount: input.amount,
        incurredOn,
        treatment: "VALUATION_DILUTION",
        note: input.note,
      },
    });

    await tx.property.update({
      where: { id: property.id },
      data: { currentValuation: valuationAfter },
    });

    const asOf = toSnapshotAsOf(incurredOn);
    await tx.ownershipSnapshot.createMany({
      data: ownershipAfter.map((position) => ({
        partnershipId: input.partnershipId,
        membershipId: position.membershipId,
        asOf,
        ownershipPct: position.ownershipPctAfter,
        equityValue: roundMoney((position.ownershipPctAfter / 100) * valuationAfter),
      })),
    });

    await tx.auditLog.create({
      data: {
        partnershipId: input.partnershipId,
        actorId: input.actorUserId,
        entityType: "HOME_EXPENSE",
        entityId: expense.id,
        action: "CREATE",
        afterData: {
          treatment: "VALUATION_DILUTION",
          amount: input.amount,
          valuationBefore,
          valuationAfter,
          ownershipAfter,
        },
      },
    });

    return {
      expenseId: expense.id,
      entryType: "EXPENSE" as const,
      valuationBefore,
      valuationAfter,
    };
  });
}

function parseDateInput(value: string, label: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid ISO date string.`);
  }

  return parsed;
}

function toUtcMonthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function toSnapshotAsOf(date: Date) {
  // Keep snapshot ordering deterministic and avoid same-month collision with month-start snapshots.
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
