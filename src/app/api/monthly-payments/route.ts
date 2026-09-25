import { NextResponse } from "next/server";
import { parseMonthlyEntryRequest, postMonthlyEntry } from "@/lib/accounting/monthly-entry";
import { createHomeExpenseAndEffects } from "@/lib/accounting/home-expense-post";
import { requireSessionUser } from "@/lib/auth/session";
import { requirePartnershipAccess } from "@/lib/auth/authorization";
import { errorResponse } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const sessionUser = await requireSessionUser();
    const body = (await request.json()) as Record<string, unknown>;

    if (body.entryType === "EXPENSE") {
      const partnershipId = String(body.partnershipId ?? "");
      await requirePartnershipAccess(partnershipId, sessionUser);
      if (body.expenseTreatment !== "AMORTIZE_OFFSET" && body.expenseTreatment !== "VALUATION_DILUTION") {
        throw new Error("expenseTreatment must be AMORTIZE_OFFSET or VALUATION_DILUTION.");
      }
      const result = await createHomeExpenseAndEffects({
        partnershipId,
        amount: Number(body.expenseAmount),
        incurredOn: String(body.expenseIncurredOn ?? ""),
        treatment: body.expenseTreatment,
        amortizationMonths:
          body.expenseAmortizationMonths === undefined ? undefined : Number(body.expenseAmortizationMonths),
        note: typeof body.note === "string" ? body.note : undefined,
        actorUserId: sessionUser.id,
      });
      return NextResponse.json(result, { status: 201 });
    }

    const entry = parseMonthlyEntryRequest(body);
    await requirePartnershipAccess(entry.partnershipId, sessionUser);
    const result = await postMonthlyEntry(entry, sessionUser.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unexpected error while recording the entry.");
  }
}
