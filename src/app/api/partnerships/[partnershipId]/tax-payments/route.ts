import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";
import { requirePartnershipAccess } from "@/lib/auth/authorization";
import { errorResponse } from "@/lib/http";
import { parseDateOnly } from "@/lib/accounting/partnership-data";

/**
 * Records a tax bill being paid.
 * OUT_OF_POCKET: the occupant paid it; it is reimbursed from rent over coverageMonths.
 * RESERVE_PAYMENT: it was paid from the partnership tax reserve.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ partnershipId: string }> },
) {
  try {
    const sessionUser = await requireSessionUser();
    const { partnershipId } = await context.params;
    await requirePartnershipAccess(partnershipId, sessionUser);
    if (sessionUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admin users can record tax payments." }, { status: 403 });
    }

    const body = (await request.json()) as {
      kind?: "OUT_OF_POCKET" | "RESERVE_PAYMENT";
      amount?: number;
      paidOn?: string;
      coverageMonths?: number;
      note?: string;
    };

    if (body.kind !== "OUT_OF_POCKET" && body.kind !== "RESERVE_PAYMENT") {
      throw new Error("kind must be OUT_OF_POCKET or RESERVE_PAYMENT.");
    }
    if (typeof body.amount !== "number" || !(body.amount > 0)) {
      throw new Error("amount must be a positive number.");
    }
    const paidOn = parseDateOnly(body.paidOn, "paidOn");
    const coverageMonths = body.kind === "OUT_OF_POCKET" ? body.coverageMonths : 1;
    if (!Number.isInteger(coverageMonths) || (coverageMonths ?? 0) < 1) {
      throw new Error("coverageMonths must be a positive whole number.");
    }

    const occupant = await prisma.partnerMembership.findFirst({
      where: { partnershipId, role: "OCCUPANT", isActive: true },
      select: { id: true },
    });

    const payment = await prisma.taxPayment.create({
      data: {
        partnershipId,
        kind: body.kind,
        paidByMembershipId: body.kind === "OUT_OF_POCKET" ? occupant?.id : null,
        amount: body.amount,
        coverageMonths: coverageMonths!,
        paidOn,
        reimbursementStart: paidOn,
        note: body.note?.trim() || null,
      },
    });

    return NextResponse.json({ ok: true, paymentId: payment.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unexpected error while recording tax payment.");
  }
}
