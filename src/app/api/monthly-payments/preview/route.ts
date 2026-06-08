import { NextResponse } from "next/server";
import { buildMonthlyPaymentPreviewForPartnership } from "@/lib/accounting/monthly-payment-context";
import { requireSessionUser } from "@/lib/auth/session";
import { requireMembershipInPartnership } from "@/lib/auth/authorization";

export async function POST(request: Request) {
  try {
    const sessionUser = await requireSessionUser();

    const body = (await request.json()) as {
      entryType?: "RENT" | "EXPENSE";
      partnershipId?: string;
      occupantMembershipId?: string;
      paymentMonth?: string;
      totalPaid?: number;
      agreedRent?: number;
      propertyValuation?: number;
    };

    if (body.entryType === "EXPENSE") {
      return NextResponse.json(
        { error: "Expense entries do not support preview. Record the entry directly." },
        { status: 400 },
      );
    }

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

    const preview = await buildMonthlyPaymentPreviewForPartnership({
      partnershipId: body.partnershipId,
      occupantMembershipId: body.occupantMembershipId,
      paymentMonth: body.paymentMonth,
      totalPaid: body.totalPaid,
      agreedRent: body.agreedRent,
      propertyValuation: body.propertyValuation,
    });

    return NextResponse.json(preview, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this partnership." }, { status: 403 });
    }

    const message =
      error instanceof Error ? error.message : "Unexpected error while previewing payment.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
