import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";
import { requirePartnershipAccess } from "@/lib/auth/authorization";

export async function GET(request: Request) {
  try {
    const sessionUser = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const partnershipId = searchParams.get("partnershipId");

    if (!partnershipId) {
      return NextResponse.json({ error: "partnershipId query parameter is required." }, { status: 400 });
    }

    await requirePartnershipAccess(partnershipId, sessionUser);

    const payments = await prisma.monthlyPayment.findMany({
      where: { partnershipId },
      include: {
        allocations: true,
      },
      orderBy: [{ paymentMonth: "asc" }, { createdAt: "asc" }],
    });

    const rows: string[] = [
      [
        "payment_id",
        "payment_month",
        "total_paid",
        "agreed_rent_applied",
        "tax_reimbursement",
        "net_rent_for_split",
        "ownership_purchase",
        "allocation_membership_id",
        "allocation_ownership_pct_before",
        "allocation_rent_amount",
        "allocation_purchase_amount",
      ].join(","),
    ];

    for (const payment of payments) {
      if (payment.allocations.length === 0) {
        rows.push(
          [
            payment.id,
            payment.paymentMonth.toISOString().slice(0, 10),
            Number(payment.totalPaid).toFixed(2),
            Number(payment.agreedRentApplied).toFixed(2),
            Number(payment.taxReimbursement).toFixed(2),
            Number(payment.netRentForSplit).toFixed(2),
            Number(payment.ownershipPurchase).toFixed(2),
            "",
            "",
            "",
            "",
          ].join(","),
        );
        continue;
      }

      for (const allocation of payment.allocations) {
        rows.push(
          [
            payment.id,
            payment.paymentMonth.toISOString().slice(0, 10),
            Number(payment.totalPaid).toFixed(2),
            Number(payment.agreedRentApplied).toFixed(2),
            Number(payment.taxReimbursement).toFixed(2),
            Number(payment.netRentForSplit).toFixed(2),
            Number(payment.ownershipPurchase).toFixed(2),
            allocation.membershipId,
            Number(allocation.ownershipPctBefore).toFixed(4),
            Number(allocation.rentAmount).toFixed(2),
            Number(allocation.purchaseAmount).toFixed(2),
          ].join(","),
        );
      }
    }

    return new NextResponse(rows.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=ledger-${partnershipId}.csv`,
      },
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
        error: error instanceof Error ? error.message : "Failed to export ledger CSV.",
      },
      { status: 400 },
    );
  }
}
