import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";
import { requirePartnershipAccess } from "@/lib/auth/authorization";
import { errorResponse } from "@/lib/http";
import { monthStart } from "@/lib/accounting/tax";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ partnershipId: string }> },
) {
  try {
    const sessionUser = await requireSessionUser();
    const { partnershipId } = await context.params;
    await requirePartnershipAccess(partnershipId, sessionUser);
    if (sessionUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admin users can update settings." }, { status: 403 });
    }

    const body = (await request.json()) as {
      agreedRent?: number;
      currentValuation?: number;
      taxMode?: "OUT_OF_POCKET" | "RESERVE";
      taxPerCycle?: number;
      taxCycleMonths?: number;
    };

    if (!isPositive(body.agreedRent)) throw new Error("agreedRent must be a positive number.");
    if (!isPositive(body.currentValuation)) throw new Error("currentValuation must be a positive number.");

    const taxGiven = [body.taxMode, body.taxPerCycle, body.taxCycleMonths].some((value) => value !== undefined);
    if (taxGiven) {
      if (body.taxMode !== "OUT_OF_POCKET" && body.taxMode !== "RESERVE") {
        throw new Error("taxMode must be OUT_OF_POCKET or RESERVE.");
      }
      if (!isPositive(body.taxPerCycle)) throw new Error("taxPerCycle must be a positive number.");
      if (body.taxCycleMonths !== 6 && body.taxCycleMonths !== 12) {
        throw new Error("taxCycleMonths must be 6 or 12.");
      }
    }

    const property = await prisma.property.findFirst({
      where: { partnershipId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!property) throw new Error("No property found for partnership.");

    const effectiveFrom = monthStart(new Date());
    const current = await prisma.monthlyPolicy.findFirst({
      where: { partnershipId, effectiveTo: null },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    });

    const policyData = {
      agreedRent: body.agreedRent,
      taxMode: taxGiven ? body.taxMode : current?.taxMode ?? null,
      taxPerCycle: taxGiven ? body.taxPerCycle : current?.taxPerCycle ?? null,
      taxCycleMonths: taxGiven ? body.taxCycleMonths : current?.taxCycleMonths ?? null,
    };

    await prisma.$transaction(async (tx) => {
      if (current && current.effectiveFrom >= effectiveFrom) {
        // Already changed this month: amend that policy rather than stacking another.
        await tx.monthlyPolicy.update({ where: { id: current.id }, data: policyData });
      } else {
        if (current) {
          await tx.monthlyPolicy.update({
            where: { id: current.id },
            data: { effectiveTo: new Date(effectiveFrom.getTime() - 24 * 60 * 60 * 1000) },
          });
        }
        await tx.monthlyPolicy.create({
          data: { partnershipId, effectiveFrom, note: "Updated via settings", ...policyData },
        });
      }

      await tx.property.update({
        where: { id: property.id },
        data: { currentValuation: body.currentValuation },
      });

      await tx.auditLog.create({
        data: {
          partnershipId,
          actorId: sessionUser.id,
          entityType: "MONTHLY_POLICY",
          entityId: partnershipId,
          action: "UPDATE",
          afterData: { ...policyData, taxPerCycle: Number(policyData.taxPerCycle ?? 0), currentValuation: body.currentValuation },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Unexpected error while updating settings.");
  }
}

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
