import { NextResponse } from "next/server";
import { getPartnershipMonthlyData } from "@/lib/accounting/monthly-payment-data";
import { projectBuyoutTimeline } from "@/lib/projections/buyout";
import { requireSessionUser } from "@/lib/auth/session";
import { requireMembershipInPartnership } from "@/lib/auth/authorization";

export async function GET(request: Request) {
  try {
    const sessionUser = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const partnershipId = searchParams.get("partnershipId");
    const occupantMembershipId = searchParams.get("occupantMembershipId");
    const startMonth = searchParams.get("startMonth");
    const monthlyTotalPaidRaw = searchParams.get("monthlyTotalPaid");

    if (!partnershipId || !occupantMembershipId || !startMonth || !monthlyTotalPaidRaw) {
      return NextResponse.json(
        {
          error:
            "partnershipId, occupantMembershipId, startMonth, and monthlyTotalPaid are required query parameters.",
        },
        { status: 400 },
      );
    }

    await requireMembershipInPartnership(partnershipId, occupantMembershipId, sessionUser);

    const monthlyTotalPaid = Number(monthlyTotalPaidRaw);
    if (Number.isNaN(monthlyTotalPaid) || monthlyTotalPaid <= 0) {
      return NextResponse.json({ error: "monthlyTotalPaid must be a positive number." }, { status: 400 });
    }

    const monthDate = new Date(startMonth);
    if (Number.isNaN(monthDate.getTime())) {
      return NextResponse.json({ error: "startMonth must be a valid date string." }, { status: 400 });
    }

    const data = await getPartnershipMonthlyData({
      partnershipId,
      occupantMembershipId,
      paymentMonth: new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1)),
    });

    const projection = projectBuyoutTimeline({
      startMonth: monthDate,
      monthlyTotalPaid,
      agreedRent: data.agreedRent,
      propertyValuation: data.valuation,
      occupantMembershipId,
      ownerships: data.ownerships,
      taxSchedules: data.taxSchedules,
    });

    const rows = [
      [
        "month",
        "ownership_purchase",
        "partner_rent",
        "partner_ownership_pct",
        "occupant_ownership_pct",
      ].join(","),
      ...projection.history.map((month) =>
        [
          month.month,
          month.ownershipPurchase.toFixed(2),
          month.partnerRent.toFixed(2),
          month.partnerOwnershipPct.toFixed(4),
          month.occupantOwnershipPct.toFixed(4),
        ].join(","),
      ),
    ];

    return new NextResponse(rows.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=projection-${partnershipId}.csv`,
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
        error: error instanceof Error ? error.message : "Failed to export projection CSV.",
      },
      { status: 400 },
    );
  }
}
