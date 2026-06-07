import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";
import { requirePartnershipAccess } from "@/lib/auth/authorization";

export async function POST(
  request: Request,
  context: { params: Promise<{ partnershipId: string }> },
) {
  try {
    const sessionUser = await requireSessionUser();
    const { partnershipId } = await context.params;

    await requirePartnershipAccess(partnershipId, sessionUser);

    if (sessionUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only admin users can record reserve tax payments." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      amount?: number;
      paidOn?: string;
      note?: string;
    };

    if (typeof body.amount !== "number" || Number.isNaN(body.amount) || body.amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number." }, { status: 400 });
    }

    const paidOn = new Date(String(body.paidOn ?? ""));
    if (Number.isNaN(paidOn.getTime())) {
      return NextResponse.json({ error: "paidOn must be a valid date." }, { status: 400 });
    }

    const payment = await prisma.taxPayment.create({
      data: {
        partnershipId,
        paidByMembershipId: null,
        amount: body.amount,
        coverageMonths: 1,
        paidOn,
        reimbursementStart: paidOn,
        note: `[RESERVE_PAYMENT] ${body.note ?? "Tax paid from partnership reserve"}`,
      },
    });

    return NextResponse.json({ ok: true, paymentId: payment.id }, { status: 201 });
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
            : "Unexpected error while recording reserve payment.",
      },
      { status: 400 },
    );
  }
}
