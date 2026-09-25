import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/session";
import { requirePartnershipAccess } from "@/lib/auth/authorization";
import { errorResponse } from "@/lib/http";
import { projectPartnership } from "@/lib/projections/partnership-projection";

export async function POST(request: Request) {
  try {
    const sessionUser = await requireSessionUser();
    const body = (await request.json()) as {
      partnershipId?: string;
      monthlyTotalPaid?: number;
      maxMonths?: number;
    };
    if (!body.partnershipId) throw new Error("partnershipId is required.");
    await requirePartnershipAccess(body.partnershipId, sessionUser);

    return NextResponse.json(
      await projectPartnership({
        partnershipId: body.partnershipId,
        monthlyTotalPaid: Number(body.monthlyTotalPaid),
        maxMonths: body.maxMonths ? Number(body.maxMonths) : undefined,
      }),
    );
  } catch (error) {
    return errorResponse(error, "Failed to run projection.");
  }
}
