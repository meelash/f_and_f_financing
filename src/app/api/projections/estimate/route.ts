import { NextResponse } from "next/server";
import { getPartnershipMonthlyData } from "@/lib/accounting/monthly-payment-data";
import { projectBuyoutTimeline } from "@/lib/projections/buyout";
import { requireSessionUser } from "@/lib/auth/session";
import { requireMembershipInPartnership } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const sessionUser = await requireSessionUser();

    const body = (await request.json()) as {
      partnershipId?: string;
      occupantMembershipId?: string;
      monthlyTotalPaid?: number;
      agreedRent?: number;
      propertyValuation?: number;
      maxMonths?: number;
    };

    if (!body.partnershipId || !body.occupantMembershipId) {
      return NextResponse.json(
        {
          error: "partnershipId and occupantMembershipId are required.",
        },
        { status: 400 },
      );
    }

    if (typeof body.monthlyTotalPaid !== "number" || Number.isNaN(body.monthlyTotalPaid)) {
      return NextResponse.json({ error: "monthlyTotalPaid must be a valid number." }, { status: 400 });
    }

    await requireMembershipInPartnership(
      body.partnershipId,
      body.occupantMembershipId,
      sessionUser,
    );

    const latestPayment = await prisma.monthlyPayment.findFirst({
      where: { partnershipId: body.partnershipId },
      orderBy: [{ paymentMonth: "desc" }, { createdAt: "desc" }],
      select: { paymentMonth: true },
    });

    const startMonth = latestPayment
      ? new Date(
          Date.UTC(
            latestPayment.paymentMonth.getUTCFullYear(),
            latestPayment.paymentMonth.getUTCMonth() + 1,
            1,
          ),
        )
      : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    const data = await getPartnershipMonthlyData({
      partnershipId: body.partnershipId,
      occupantMembershipId: body.occupantMembershipId,
      paymentMonth: new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth(), 1)),
      agreedRentOverride: body.agreedRent,
      valuationOverride: body.propertyValuation,
    });

    const result = projectBuyoutTimeline({
      startMonth,
      monthlyTotalPaid: body.monthlyTotalPaid,
      agreedRent: data.agreedRent,
      propertyValuation: data.valuation,
      occupantMembershipId: body.occupantMembershipId,
      ownerships: data.ownerships,
      taxSchedules: data.taxSchedules,
      maxMonths: body.maxMonths,
    });

    return NextResponse.json({
      inputs: {
        startMonth: new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth(), 1))
          .toISOString()
          .slice(0, 10),
        agreedRent: data.agreedRent,
        valuation: data.valuation,
        monthlyTotalPaid: body.monthlyTotalPaid,
      },
      result,
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
        error: error instanceof Error ? error.message : "Failed to run projection.",
      },
      { status: 400 },
    );
  }
}
