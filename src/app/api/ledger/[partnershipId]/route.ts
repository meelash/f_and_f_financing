import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";
import { requirePartnershipAccess } from "@/lib/auth/authorization";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/ledger/[partnershipId]">,
) {
  try {
    const sessionUser = await requireSessionUser();
    const { partnershipId } = await context.params;
    await requirePartnershipAccess(partnershipId, sessionUser);

    const payments = await prisma.monthlyPayment.findMany({
      where: { partnershipId },
      include: {
        allocations: true,
        fromMembership: {
          include: {
            user: true,
          },
        },
        toMembership: {
          include: {
            user: true,
          },
        },
      },
      orderBy: [{ paymentMonth: "asc" }, { createdAt: "asc" }],
    });

    const snapshots = await prisma.ownershipSnapshot.findMany({
      where: { partnershipId },
      include: {
        membership: {
          include: {
            user: true,
          },
        },
      },
      orderBy: [{ asOf: "asc" }, { createdAt: "asc" }],
    });

    const taxPayments = await prisma.taxPayment.findMany({
      where: {
        partnershipId,
        note: {
          startsWith: "[OUT_OF_POCKET_PAYMENT]",
        },
      },
      include: {
        paidByMembership: {
          include: {
            user: true,
          },
        },
      },
      orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
    });

    const homeExpenses = await prisma.homeExpense.findMany({
      where: { partnershipId },
      include: {
        paidByMembership: {
          include: {
            user: true,
          },
        },
      },
      orderBy: [{ incurredOn: "asc" }, { createdAt: "asc" }],
    });

    const records = [
      ...payments.map((payment) => ({
        id: payment.id,
        type: "MONTHLY_RENT" as const,
        occurredOn: payment.paymentMonth,
        amount: Number(payment.totalPaid),
        agreedRentApplied: Number(payment.agreedRentApplied),
        taxReimbursement: Number(payment.taxReimbursement),
        ownershipPurchase: Number(payment.ownershipPurchase),
        note: payment.note,
        createdAt: payment.createdAt,
      })),
      ...taxPayments.map((payment) => ({
        id: payment.id,
        type: "TAX_OUT_OF_POCKET" as const,
        occurredOn: payment.paidOn,
        amount: Number(payment.amount),
        agreedRentApplied: 0,
        taxReimbursement: 0,
        ownershipPurchase: 0,
        note: payment.note,
        createdAt: payment.createdAt,
      })),
      ...homeExpenses.map((expense) => ({
        id: expense.id,
        type: "HOME_EXPENSE" as const,
        occurredOn: expense.incurredOn,
        amount: Number(expense.amount),
        agreedRentApplied: 0,
        taxReimbursement: 0,
        ownershipPurchase:
          expense.treatment === "VALUATION_DILUTION" ? Number(expense.amount) : 0,
        treatment: expense.treatment,
        amortizationMonths: expense.amortizationMonths,
        note: expense.note,
        createdAt: expense.createdAt,
      })),
    ]
      .sort((left, right) => {
        const dateDelta = left.occurredOn.getTime() - right.occurredOn.getTime();
        if (dateDelta !== 0) {
          return dateDelta;
        }
        return left.createdAt.getTime() - right.createdAt.getTime();
      })
      .map((record) => ({
        id: record.id,
        type: record.type,
        occurredOn: record.occurredOn,
        amount: record.amount,
        agreedRentApplied: record.agreedRentApplied,
        taxReimbursement: record.taxReimbursement,
        ownershipPurchase: record.ownershipPurchase,
        treatment: record.treatment,
        amortizationMonths: record.amortizationMonths,
        note: record.note,
      }));

    return NextResponse.json({
      records,
      payments: payments.map((payment) => ({
        id: payment.id,
        paymentMonth: payment.paymentMonth,
        totalPaid: Number(payment.totalPaid),
        agreedRentApplied: Number(payment.agreedRentApplied),
        taxReimbursement: Number(payment.taxReimbursement),
        netRentForSplit: Number(payment.netRentForSplit),
        ownershipPurchase: Number(payment.ownershipPurchase),
        note: payment.note,
        allocations: payment.allocations.map((allocation) => ({
          membershipId: allocation.membershipId,
          ownershipPctBefore: Number(allocation.ownershipPctBefore),
          rentAmount: Number(allocation.rentAmount),
          purchaseAmount: Number(allocation.purchaseAmount),
        })),
      })),
      ownershipTimeline: snapshots.map((snapshot) => ({
        asOf: snapshot.asOf,
        membershipId: snapshot.membershipId,
        displayLabel: snapshot.membership.displayLabel,
        ownershipPct: Number(snapshot.ownershipPct),
        equityValue: Number(snapshot.equityValue ?? 0),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this partnership." }, { status: 403 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load ledger.",
      },
      { status: 400 },
    );
  }
}
