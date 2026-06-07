import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";
import { requirePartnershipAccess } from "@/lib/auth/authorization";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ partnershipId: string }> },
) {
  try {
    const sessionUser = await requireSessionUser();
    const { partnershipId } = await context.params;

    await requirePartnershipAccess(partnershipId, sessionUser);

    if (sessionUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only admin users can update partnership settings." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      agreedRent?: number;
      currentValuation?: number;
      taxMode?: "OUT_OF_POCKET" | "RESERVE";
      taxAmount?: number;
      taxCoverageMonths?: number;
    };

    if (typeof body.agreedRent !== "number" || Number.isNaN(body.agreedRent) || body.agreedRent <= 0) {
      return NextResponse.json({ error: "agreedRent must be a positive number." }, { status: 400 });
    }

    if (
      typeof body.currentValuation !== "number" ||
      Number.isNaN(body.currentValuation) ||
      body.currentValuation <= 0
    ) {
      return NextResponse.json(
        { error: "currentValuation must be a positive number." },
        { status: 400 },
      );
    }

    if (body.taxMode && body.taxMode !== "OUT_OF_POCKET" && body.taxMode !== "RESERVE") {
      return NextResponse.json(
        { error: "taxMode must be OUT_OF_POCKET or RESERVE." },
        { status: 400 },
      );
    }

    if (
      body.taxAmount !== undefined &&
      (typeof body.taxAmount !== "number" || Number.isNaN(body.taxAmount) || body.taxAmount <= 0)
    ) {
      return NextResponse.json({ error: "taxAmount must be a positive number." }, { status: 400 });
    }

    if (
      body.taxCoverageMonths !== undefined &&
      body.taxCoverageMonths !== 6 &&
      body.taxCoverageMonths !== 12
    ) {
      return NextResponse.json(
        { error: "taxCoverageMonths must be 6 or 12." },
        { status: 400 },
      );
    }

    if (
      body.taxMode !== undefined ||
      body.taxAmount !== undefined ||
      body.taxCoverageMonths !== undefined
    ) {
      if (!body.taxMode || body.taxAmount === undefined || body.taxCoverageMonths === undefined) {
        return NextResponse.json(
          { error: "taxMode, taxAmount, and taxCoverageMonths must be provided together." },
          { status: 400 },
        );
      }
    }

    const agreedRent = body.agreedRent;
    const currentValuation = body.currentValuation;

    const property = await prisma.property.findFirst({
      where: { partnershipId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    const occupantMembership = await prisma.partnerMembership.findFirst({
      where: {
        partnershipId,
        role: "OCCUPANT",
        isActive: true,
      },
      select: { id: true },
    });

    if (!property) {
      return NextResponse.json({ error: "No property found for partnership." }, { status: 404 });
    }

    const now = new Date();
    const effectiveFrom = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const previousEffectiveTo = new Date(effectiveFrom.getTime() - 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      await tx.monthlyPolicy.updateMany({
        where: {
          partnershipId,
          effectiveTo: null,
        },
        data: {
          effectiveTo: previousEffectiveTo,
        },
      });

      await tx.monthlyPolicy.create({
        data: {
          partnershipId,
          effectiveFrom,
          agreedRent,
          note: "Updated via partnership settings",
        },
      });

      await tx.property.update({
        where: { id: property.id },
        data: {
          currentValuation,
        },
      });

      await tx.auditLog.create({
        data: {
          partnershipId,
          actorId: sessionUser.id,
          entityType: "MONTHLY_POLICY",
          entityId: partnershipId,
          action: "UPDATE",
          afterData: {
            agreedRent,
            currentValuation,
            source: "ledger_settings",
          },
        },
      });

      if (
        body.taxMode &&
        body.taxAmount !== undefined &&
        body.taxCoverageMonths !== undefined
      ) {
        await tx.taxPayment.create({
          data: {
            partnershipId,
            paidByMembershipId:
              body.taxMode === "OUT_OF_POCKET" ? occupantMembership?.id ?? null : null,
            amount: body.taxAmount,
            coverageMonths: body.taxCoverageMonths,
            paidOn: effectiveFrom,
            reimbursementStart: effectiveFrom,
            note: `[POLICY] mode=${body.taxMode}`,
          },
        });
      }
    });

    return NextResponse.json(
      {
        ok: true,
        settings: {
          agreedRent,
          currentValuation,
          taxMode: body.taxMode,
          taxAmount: body.taxAmount,
          taxCoverageMonths: body.taxCoverageMonths,
          updatedAt: now.toISOString(),
        },
      },
      { status: 200 },
    );
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
            : "Unexpected error while updating partnership settings.",
      },
      { status: 400 },
    );
  }
}
