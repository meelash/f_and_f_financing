import { prisma } from "@/lib/prisma";
import { roundMoney, roundPct } from "@/lib/accounting/monthly-payment";
import { monthStart } from "@/lib/accounting/tax";
import {
  findOccupant,
  loadPartnership,
  ownershipAsOf,
  parseDateOnly,
} from "@/lib/accounting/partnership-data";

export type CreateHomeExpenseInput = {
  partnershipId: string;
  amount: number;
  incurredOn: string;
  treatment: "AMORTIZE_OFFSET" | "VALUATION_DILUTION";
  amortizationMonths?: number;
  note?: string;
  actorUserId?: string;
};

/**
 * Records an expense the occupant paid for the home.
 *
 * AMORTIZE_OFFSET: reimbursed from rent over `amortizationMonths`, exactly like an
 * out-of-pocket tax payment (it shows up in the suggested reimbursement).
 * VALUATION_DILUTION: the property valuation rises by the amount and the occupant owns
 * that added value, so everyone else's percentage is diluted.
 */
export async function createHomeExpenseAndEffects(input: CreateHomeExpenseInput) {
  if (!(input.amount > 0)) throw new Error("Expense amount must be greater than 0.");
  const incurredOn = parseDateOnly(input.incurredOn, "Expense date");

  const partnership = await loadPartnership(input.partnershipId);
  if (!partnership) throw new Error("Partnership not found.");
  const occupant = findOccupant(partnership);
  const property = partnership.properties[0];

  if (input.treatment === "AMORTIZE_OFFSET") {
    const months = input.amortizationMonths ?? 0;
    if (!Number.isInteger(months) || months <= 0) {
      throw new Error("Offset months must be a positive whole number.");
    }
    return prisma.$transaction(async (tx) => {
      const expense = await tx.homeExpense.create({
        data: {
          partnershipId: input.partnershipId,
          propertyId: property?.id,
          paidByMembershipId: occupant.id,
          amount: input.amount,
          incurredOn,
          treatment: "AMORTIZE_OFFSET",
          amortizationMonths: months,
          offsetStartMonth: monthStart(incurredOn),
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
          afterData: { treatment: "AMORTIZE_OFFSET", amount: input.amount, amortizationMonths: months },
        },
      });
      return { expenseId: expense.id, entryType: "EXPENSE" as const };
    });
  }

  if (!property) throw new Error("A property is required before posting a valuation expense.");
  const valuationBefore = Number(property.currentValuation ?? property.initialValuation ?? 0);
  if (!(valuationBefore > 0)) throw new Error("Set a property valuation first.");

  const ownershipBefore = await ownershipAsOf(partnership, occupant.id, incurredOn);
  const valuationAfter = roundMoney(valuationBefore + input.amount);
  const investorsAfter = ownershipBefore
    .filter((position) => !position.isOccupant)
    .map((position) => ({
      membershipId: position.membershipId,
      ownershipPct: roundPct((position.ownershipPct * valuationBefore) / valuationAfter),
    }));
  const ownershipAfter = [
    ...investorsAfter,
    {
      membershipId: occupant.id,
      ownershipPct: roundPct(100 - investorsAfter.reduce((sum, position) => sum + position.ownershipPct, 0)),
    },
  ];

  return prisma.$transaction(async (tx) => {
    const expense = await tx.homeExpense.create({
      data: {
        partnershipId: input.partnershipId,
        propertyId: property.id,
        paidByMembershipId: occupant.id,
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
    for (const position of ownershipAfter) {
      const snapshot = {
        ownershipPct: position.ownershipPct,
        equityValue: roundMoney((position.ownershipPct / 100) * valuationAfter),
      };
      await tx.ownershipSnapshot.upsert({
        where: {
          partnershipId_membershipId_asOf: {
            partnershipId: input.partnershipId,
            membershipId: position.membershipId,
            asOf: incurredOn,
          },
        },
        create: {
          partnershipId: input.partnershipId,
          membershipId: position.membershipId,
          asOf: incurredOn,
          ...snapshot,
        },
        update: snapshot,
      });
    }
    await tx.auditLog.create({
      data: {
        partnershipId: input.partnershipId,
        actorId: input.actorUserId,
        entityType: "HOME_EXPENSE",
        entityId: expense.id,
        action: "CREATE",
        afterData: { treatment: "VALUATION_DILUTION", amount: input.amount, valuationBefore, valuationAfter, ownershipAfter },
      },
    });
    return { expenseId: expense.id, entryType: "EXPENSE" as const, valuationBefore, valuationAfter };
  });
}
