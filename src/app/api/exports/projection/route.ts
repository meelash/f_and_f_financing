import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/session";
import { requirePartnershipAccess } from "@/lib/auth/authorization";
import { errorResponse } from "@/lib/http";
import { projectPartnership } from "@/lib/projections/partnership-projection";

export async function GET(request: Request) {
  try {
    const sessionUser = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const partnershipId = searchParams.get("partnershipId");
    if (!partnershipId) throw new Error("partnershipId is required.");
    await requirePartnershipAccess(partnershipId, sessionUser);

    const { ownerships, result } = await projectPartnership({
      partnershipId,
      monthlyTotalPaid: Number(searchParams.get("monthlyTotalPaid")),
    });

    const header = [
      "month",
      "investor_dividends",
      "ownership_purchase",
      ...ownerships.map((position) => `${position.displayLabel} ownership_pct_after`),
    ];
    const rows = result.history.map((month) =>
      [
        month.month,
        month.investorDividends.toFixed(2),
        month.ownershipPurchase.toFixed(2),
        ...ownerships.map((position) => (month.ownershipPctAfter[position.membershipId] ?? 0).toFixed(4)),
      ].join(","),
    );

    return new NextResponse([header.map((cell) => `"${cell}"`).join(","), ...rows].join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=projection-${partnershipId}.csv`,
      },
    });
  } catch (error) {
    return errorResponse(error, "Failed to export projection CSV.");
  }
}
