import { NextResponse } from "next/server";
import { createMonthlyPaymentAndSnapshots } from "@/lib/accounting/monthly-payment-post";
import { requireSessionUser } from "@/lib/auth/session";
import { requireMembershipInPartnership } from "@/lib/auth/authorization";

export async function POST(request: Request) {
  try {
    const sessionUser = await requireSessionUser();

    const body = (await request.json()) as {
      partnershipId?: string;
      occupantMembershipId?: string;
      paymentMonth?: string;
      totalPaid?: number;
      agreedRent?: number;
      propertyValuation?: number;
      note?: string;
    };

    if (!body.partnershipId || !body.occupantMembershipId || !body.paymentMonth) {
      return NextResponse.json(
        {
          error:
            "partnershipId, occupantMembershipId, and paymentMonth are required.",
        },
        { status: 400 },
      );
    }

    if (typeof body.totalPaid !== "number" || Number.isNaN(body.totalPaid)) {
      return NextResponse.json(
        {
          error: "totalPaid must be a valid number.",
        },
        { status: 400 },
      );
    }

    await requireMembershipInPartnership(
      body.partnershipId,
      body.occupantMembershipId,
      sessionUser,
    );

    const result = await createMonthlyPaymentAndSnapshots({
      partnershipId: body.partnershipId,
      occupantMembershipId: body.occupantMembershipId,
      paymentMonth: body.paymentMonth,
      totalPaid: body.totalPaid,
      agreedRent: body.agreedRent,
      propertyValuation: body.propertyValuation,
      note: body.note,
      actorUserId: sessionUser.id,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this partnership." }, { status: 403 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while creating monthly payment.",
      },
      { status: 400 },
    );
  }
}
