import { NextResponse } from "next/server";
import { parseMonthlyEntryRequest, previewMonthlyEntry } from "@/lib/accounting/monthly-entry";
import { requireSessionUser } from "@/lib/auth/session";
import { requirePartnershipAccess } from "@/lib/auth/authorization";
import { errorResponse } from "@/lib/http";

/** Returns expected amounts and suggestions for a rent month, plus the allocation if a payment is given. */
export async function POST(request: Request) {
  try {
    const sessionUser = await requireSessionUser();
    const entry = parseMonthlyEntryRequest(await request.json());
    await requirePartnershipAccess(entry.partnershipId, sessionUser);
    return NextResponse.json(await previewMonthlyEntry(entry));
  } catch (error) {
    return errorResponse(error, "Unexpected error while previewing payment.");
  }
}
