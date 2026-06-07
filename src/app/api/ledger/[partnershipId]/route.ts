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

    return NextResponse.json({
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
