import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";
import { requirePartnershipAccess } from "@/lib/auth/authorization";
import { errorResponse } from "@/lib/http";
import { findOccupant, loadPartnership } from "@/lib/accounting/partnership-data";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/ledger/[partnershipId]">,
) {
  try {
    const sessionUser = await requireSessionUser();
    const { partnershipId } = await context.params;
    await requirePartnershipAccess(partnershipId, sessionUser);

    const partnership = await loadPartnership(partnershipId);
    if (!partnership) throw new Error("Partnership not found.");

    const snapshots = await prisma.ownershipSnapshot.findMany({
      where: { partnershipId },
      include: { membership: true },
      orderBy: [{ asOf: "asc" }, { createdAt: "asc" }],
    });

    const occupant = findOccupant(partnership);
    const payments = partnership.monthlyPayments.map((payment) => ({
      id: payment.id,
      type: "MONTHLY_RENT" as const,
      date: payment.paidAt,
      rentMonth: payment.paymentMonth,
      amount: Number(payment.totalPaid),
      cashToInvestors: Number(payment.cashToInvestors),
      dividends: payment.allocations
        .filter((allocation) => allocation.membershipId !== occupant.id)
        .reduce((sum, allocation) => sum + Number(allocation.rentAmount), 0),
      ownershipPurchase: Number(payment.ownershipPurchase),
      taxReimbursement: Number(payment.taxReimbursement),
      reserveContribution: Number(payment.reserveContribution),
      occupantRetained: Number(payment.occupantRetained),
      agreedRentApplied: Number(payment.agreedRentApplied),
      note: payment.note,
      createdAt: payment.createdAt,
      allocations: payment.allocations.map((allocation) => ({
        membershipId: allocation.membershipId,
        ownershipPctBefore: Number(allocation.ownershipPctBefore),
        rentAmount: Number(allocation.rentAmount),
        purchaseAmount: Number(allocation.purchaseAmount),
      })),
    }));

    const otherRecords = [
      ...partnership.taxPayments.map((payment) => ({
        id: payment.id,
        type: payment.kind === "OUT_OF_POCKET" ? ("TAX_OUT_OF_POCKET" as const) : ("TAX_FROM_RESERVE" as const),
        date: payment.paidOn,
        amount: Number(payment.amount),
        months: payment.kind === "OUT_OF_POCKET" ? payment.coverageMonths : null,
        note: payment.note,
        createdAt: payment.createdAt,
      })),
      ...partnership.homeExpenses.map((expense) => ({
        id: expense.id,
        type: expense.treatment === "AMORTIZE_OFFSET" ? ("EXPENSE_OFFSET" as const) : ("EXPENSE_DILUTION" as const),
        date: expense.incurredOn,
        amount: Number(expense.amount),
        months: expense.amortizationMonths,
        note: expense.note,
        createdAt: expense.createdAt,
      })),
    ];

    const records = [...payments, ...otherRecords].sort(
      (left, right) =>
        left.date.getTime() - right.date.getTime() ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    );

    return NextResponse.json({
      records,
      ownershipTimeline: snapshots.map((snapshot) => ({
        asOf: snapshot.asOf,
        membershipId: snapshot.membershipId,
        displayLabel: snapshot.membership.displayLabel,
        ownershipPct: Number(snapshot.ownershipPct),
        equityValue: Number(snapshot.equityValue ?? 0),
      })),
    });
  } catch (error) {
    return errorResponse(error, "Failed to load ledger.");
  }
}
