import { prisma } from "@/lib/prisma";
import { computeMonthlyPayment, type PaymentAmount } from "@/lib/accounting/monthly-payment";
import {
  loadEntryContext,
  parseDateOnly,
  parseMonth,
  type EntryContext,
} from "@/lib/accounting/partnership-data";

export type MonthlyEntryRequest = {
  partnershipId: string;
  rentMonth: string;
  paidOn: string;
  /** Omit to just get the context (expected amounts and suggestions) without a result. */
  payment?: PaymentAmount;
  /** Omit to use the suggested amount. */
  taxReimbursement?: number;
  reserveContribution?: number;
  takeDividend?: boolean;
  takeReimbursement?: boolean;
  note?: string;
};

export function parseMonthlyEntryRequest(body: Record<string, unknown>): MonthlyEntryRequest {
  if (typeof body.partnershipId !== "string" || !body.partnershipId) {
    throw new Error("partnershipId is required.");
  }
  const payment = body.payment as { mode?: unknown; amount?: unknown } | undefined;
  if (payment !== undefined && payment !== null) {
    if (payment.mode !== "TOTAL" && payment.mode !== "CASH_TO_INVESTORS") {
      throw new Error("payment.mode must be TOTAL or CASH_TO_INVESTORS.");
    }
    if (!isMoney(payment.amount)) throw new Error("payment.amount must be 0 or more.");
  }
  for (const key of ["taxReimbursement", "reserveContribution"] as const) {
    if (body[key] !== undefined && body[key] !== null && !isMoney(body[key])) {
      throw new Error(`${key} must be 0 or more.`);
    }
  }
  return {
    partnershipId: body.partnershipId,
    rentMonth: String(body.rentMonth ?? ""),
    paidOn: String(body.paidOn ?? ""),
    payment: payment ? (payment as PaymentAmount) : undefined,
    taxReimbursement: optionalNumber(body.taxReimbursement),
    reserveContribution: optionalNumber(body.reserveContribution),
    takeDividend: body.takeDividend === true,
    takeReimbursement: body.takeReimbursement === true,
    note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined,
  };
}

export async function previewMonthlyEntry(request: MonthlyEntryRequest) {
  const context = await loadEntryContext({
    partnershipId: request.partnershipId,
    rentMonth: parseMonth(request.rentMonth, "rentMonth"),
    paidOn: parseDateOnly(request.paidOn, "paidOn"),
  });
  const result = computeMonthlyPayment({
    agreedRent: context.agreedRent,
    propertyValuation: context.valuation,
    ownerships: context.ownerships,
    monthStartOwnershipPct: context.monthStartOwnershipPct,
    prior: context.prior,
    taxReimbursement: request.taxReimbursement ?? context.suggested.taxReimbursement,
    reserveContribution: request.reserveContribution ?? context.suggested.reserveContribution,
    payment: request.payment ?? { mode: "TOTAL", amount: 0 },
    takeDividend: request.takeDividend,
    takeReimbursement: request.takeReimbursement,
  });
  return { context: describeContext(context), result: request.payment ? result : null, expected: result.expected };
}

export async function postMonthlyEntry(request: MonthlyEntryRequest, actorUserId?: string) {
  if (!request.payment) throw new Error("payment is required.");
  const { context, result } = await previewMonthlyEntry(request);
  if (!result) throw new Error("payment is required.");

  const paidOn = parseDateOnly(request.paidOn, "paidOn");
  const later = await prisma.ownershipSnapshot.findFirst({
    where: { partnershipId: request.partnershipId, asOf: { gt: paidOn } },
    select: { asOf: true },
  });
  if (later) {
    throw new Error(
      `Ownership has already changed after ${request.paidOn} (on ${later.asOf.toISOString().slice(0, 10)}). ` +
        "Entries must be recorded in date order.",
    );
  }

  const { summary } = result;
  return prisma.$transaction(async (tx) => {
    const payment = await tx.monthlyPayment.create({
      data: {
        partnershipId: request.partnershipId,
        fromMembershipId: context.occupantMembershipId,
        paymentMonth: parseMonth(request.rentMonth, "rentMonth"),
        paidAt: paidOn,
        totalPaid: summary.totalPaid,
        cashToInvestors: summary.cashToInvestors,
        reserveContribution: summary.reserveContribution,
        occupantRetained: summary.occupantRetained,
        agreedRentApplied: summary.agreedRentApplied,
        taxReimbursement: summary.taxReimbursement,
        netRentForSplit: summary.netRent,
        rentDistributionTotal: summary.investorDividends,
        ownershipPurchase: summary.ownershipPurchase,
        note: request.note,
      },
    });

    await tx.monthlyPaymentAllocation.createMany({
      data: result.participants.map((participant) => ({
        partnershipId: request.partnershipId,
        monthlyPaymentId: payment.id,
        membershipId: participant.membershipId,
        ownershipPctBefore: participant.ownershipPctBefore,
        rentAmount: participant.rentAmount,
        purchaseAmount: participant.purchaseAmount,
      })),
    });

    if (summary.ownershipPurchase > 0) {
      for (const participant of result.participants) {
        const snapshot = {
          ownershipPct: participant.ownershipPctAfter,
          equityValue: Math.round(participant.ownershipPctAfter * context.valuation) / 100,
        };
        await tx.ownershipSnapshot.upsert({
          where: {
            partnershipId_membershipId_asOf: {
              partnershipId: request.partnershipId,
              membershipId: participant.membershipId,
              asOf: paidOn,
            },
          },
          create: {
            partnershipId: request.partnershipId,
            membershipId: participant.membershipId,
            asOf: paidOn,
            ...snapshot,
          },
          update: snapshot,
        });
      }
    }

    await tx.auditLog.create({
      data: {
        partnershipId: request.partnershipId,
        actorId: actorUserId,
        entityType: "MONTHLY_PAYMENT",
        entityId: payment.id,
        action: "CREATE",
        afterData: { request, summary, warnings: result.warnings },
      },
    });

    return { paymentId: payment.id, result };
  });
}

function describeContext(context: EntryContext) {
  return {
    occupantMembershipId: context.occupantMembershipId,
    rentMonth: context.rentMonth.toISOString().slice(0, 10),
    agreedRent: context.agreedRent,
    valuation: context.valuation,
    taxPolicy: context.taxPolicy,
    suggested: context.suggested,
    balances: context.balances,
    prior: context.prior,
    ownerships: context.ownerships,
  };
}

function isMoney(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
