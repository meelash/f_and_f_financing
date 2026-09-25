import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";
import { requirePartnershipAccess } from "@/lib/auth/authorization";
import { errorResponse } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const sessionUser = await requireSessionUser();
    const partnershipId = new URL(request.url).searchParams.get("partnershipId");
    if (!partnershipId) throw new Error("partnershipId query parameter is required.");
    await requirePartnershipAccess(partnershipId, sessionUser);

    const payments = await prisma.monthlyPayment.findMany({
      where: { partnershipId },
      include: { allocations: { include: { membership: true } } },
      orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
    });

    const header = [
      "payment_id",
      "paid_on",
      "rent_month",
      "total_paid",
      "cash_to_investors",
      "tax_reimbursement",
      "reserve_contribution",
      "occupant_retained",
      "ownership_purchase",
      "member",
      "ownership_pct_before",
      "dividend",
      "purchase",
      "note",
    ];
    const rows = [header.join(",")];

    for (const payment of payments) {
      const base = [
        payment.id,
        payment.paidAt.toISOString().slice(0, 10),
        payment.paymentMonth.toISOString().slice(0, 7),
        money(payment.totalPaid),
        money(payment.cashToInvestors),
        money(payment.taxReimbursement),
        money(payment.reserveContribution),
        money(payment.occupantRetained),
        money(payment.ownershipPurchase),
      ];
      const allocations = payment.allocations.length ? payment.allocations : [null];
      for (const allocation of allocations) {
        rows.push(
          [
            ...base,
            csv(allocation?.membership.displayLabel ?? ""),
            allocation ? Number(allocation.ownershipPctBefore).toFixed(6) : "",
            allocation ? money(allocation.rentAmount) : "",
            allocation ? money(allocation.purchaseAmount) : "",
            csv(payment.note ?? ""),
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
    return errorResponse(error, "Failed to export ledger CSV.");
  }
}

function money(value: unknown) {
  return Number(value).toFixed(2);
}

function csv(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
