import { NextResponse } from "next/server";
import { createMonthlyPaymentAndSnapshots } from "@/lib/accounting/monthly-payment-post";
import { createHomeExpenseAndEffects } from "@/lib/accounting/home-expense-post";
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
      reimbursementAmount?: number;
      agreedRent?: number;
      propertyValuation?: number;
      expenseAmount?: number;
      expenseIncurredOn?: string;
      expenseTreatment?: "AMORTIZE_OFFSET" | "VALUATION_DILUTION";
      expenseAmortizationMonths?: number;
      note?: string;
    };

    if (!body.partnershipId || !body.occupantMembershipId) {
      return NextResponse.json(
        {
          error:
            "partnershipId and occupantMembershipId are required.",
        },
        { status: 400 },
      );
    }

    await requireMembershipInPartnership(
      body.partnershipId,
      body.occupantMembershipId,
      sessionUser,
    );

    const entryType = body.entryType ?? "RENT";
    if (entryType !== "RENT" && entryType !== "EXPENSE") {
      return NextResponse.json({ error: "entryType must be RENT or EXPENSE." }, { status: 400 });
    }

    if (
      entryType === "EXPENSE" &&
      body.expenseTreatment !== undefined &&
      body.expenseTreatment !== "AMORTIZE_OFFSET" &&
      body.expenseTreatment !== "VALUATION_DILUTION"
    ) {
      return NextResponse.json(
        { error: "expenseTreatment must be AMORTIZE_OFFSET or VALUATION_DILUTION." },
        { status: 400 },
      );
    }
    const result =
      entryType === "EXPENSE"
        ? await createHomeExpenseAndEffects({
            partnershipId: body.partnershipId,
            occupantMembershipId: body.occupantMembershipId,
            amount: Number(body.expenseAmount),
            incurredOn: String(body.expenseIncurredOn ?? ""),
            treatment: body.expenseTreatment ?? "AMORTIZE_OFFSET",
            amortizationMonths: body.expenseAmortizationMonths,
            note: body.note,
            actorUserId: sessionUser.id,
          })
        : await createMonthlyPaymentAndSnapshots({
            partnershipId: body.partnershipId,
            occupantMembershipId: body.occupantMembershipId,
            paymentMonth: String(body.paymentMonth ?? ""),
            totalPaid: Number(body.totalPaid),
            reimbursementAmount:
              typeof body.reimbursementAmount === "number" && Number.isFinite(body.reimbursementAmount)
                ? body.reimbursementAmount
                : undefined,
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
