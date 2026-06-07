import { prisma } from "@/lib/prisma";
import { computeMonthlyPaymentPreview } from "@/lib/accounting/monthly-payment";
import { getPartnershipMonthlyData } from "@/lib/accounting/monthly-payment-data";

export type CreateMonthlyPaymentInput = {
  partnershipId: string;
  occupantMembershipId: string;
  paymentMonth: string;
  totalPaid: number;
  agreedRent?: number;
  propertyValuation?: number;
  note?: string;
  actorUserId?: string;
};

export async function createMonthlyPaymentAndSnapshots(input: CreateMonthlyPaymentInput) {
  const paymentMonth = parseMonthInput(input.paymentMonth);
  const data = await getPartnershipMonthlyData({
    partnershipId: input.partnershipId,
    occupantMembershipId: input.occupantMembershipId,
    paymentMonth,
    agreedRentOverride: input.agreedRent,
    valuationOverride: input.propertyValuation,
  });

  const preview = computeMonthlyPaymentPreview({
    paymentMonth,
    totalPaid: input.totalPaid,
    agreedRent: data.agreedRent,
    propertyValuation: data.valuation,
    occupantMembershipId: input.occupantMembershipId,
    ownerships: data.ownerships,
    taxSchedules: data.taxSchedules,
  });

  const nonOccupants = preview.participants.filter((participant) => !participant.isOccupant);

  return prisma.$transaction(async (tx) => {
    const payment = await tx.monthlyPayment.create({
      data: {
        partnershipId: input.partnershipId,
        fromMembershipId: input.occupantMembershipId,
        paymentMonth,
        totalPaid: preview.summary.totalPaid,
        agreedRentApplied: preview.summary.agreedRentApplied,
        taxReimbursement: preview.summary.taxReimbursement,
        netRentForSplit: preview.summary.netRentForSplit,
        rentDistributionTotal: preview.summary.rentDistributionTotal,
        ownershipPurchase: preview.summary.appliedPurchaseAmount,
        note: input.note,
      },
    });

    await tx.monthlyPaymentAllocation.createMany({
      data: preview.participants
        .filter((participant) => participant.rentAmount > 0 || participant.purchaseAmount > 0)
        .map((participant) => ({
          partnershipId: input.partnershipId,
          monthlyPaymentId: payment.id,
          membershipId: participant.membershipId,
          ownershipPctBefore: participant.ownershipPctBefore,
          rentAmount: participant.rentAmount,
          purchaseAmount: Math.max(0, participant.purchaseAmount),
        })),
    });

    await tx.ownershipSnapshot.createMany({
      data: preview.participants.map((participant) => ({
        partnershipId: input.partnershipId,
        membershipId: participant.membershipId,
        asOf: paymentMonth,
        ownershipPct: participant.ownershipPctAfter,
        equityValue: roundMoney((participant.ownershipPctAfter / 100) * data.valuation),
      })),
      skipDuplicates: true,
    });

    await tx.auditLog.create({
      data: {
        partnershipId: input.partnershipId,
        actorId: input.actorUserId,
        entityType: "MONTHLY_PAYMENT",
        entityId: payment.id,
        action: "CREATE",
        afterData: {
          summary: preview.summary,
          warnings: preview.warnings,
          payoutMembershipIds: nonOccupants.map((participant) => participant.membershipId),
        },
      },
    });

    return {
      paymentId: payment.id,
      preview,
    };
  });
}

function parseMonthInput(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("paymentMonth must be a valid ISO date string.");
  }

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
