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
        { error: "Only admin users can record out-of-pocket tax payments." },
        { status: 403 },
      );
    }

    const occupantMembership = await prisma.partnerMembership.findFirst({
      where: {
        partnershipId,
        role: "OCCUPANT",
        isActive: true,
      },
      select: { id: true },
    });

    if (!occupantMembership) {
      return NextResponse.json(
        { error: "No active occupant membership found for partnership." },
        { status: 404 },
      );
    }

    const body = (await request.json()) as {
      amount?: number;
      paidOn?: string;
      coverageMonths?: number;
      note?: string;
    };

    if (typeof body.amount !== "number" || Number.isNaN(body.amount) || body.amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number." }, { status: 400 });
    }

    if (body.coverageMonths !== 6 && body.coverageMonths !== 12) {
      return NextResponse.json(
        { error: "coverageMonths must be 6 or 12." },
        { status: 400 },
      );
    }

    const paidOn = new Date(String(body.paidOn ?? ""));
    if (Number.isNaN(paidOn.getTime())) {
      return NextResponse.json({ error: "paidOn must be a valid date." }, { status: 400 });
    }

    const payment = await prisma.taxPayment.create({
      data: {
        partnershipId,
        paidByMembershipId: occupantMembership.id,
        amount: body.amount,
        coverageMonths: body.coverageMonths,
        paidOn,
        reimbursementStart: paidOn,
        note: `[OUT_OF_POCKET_PAYMENT] ${body.note ?? "Occupant paid taxes out of pocket"}`,
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
            : "Unexpected error while recording out-of-pocket tax payment.",
      },
      { status: 400 },
    );
  }
}
