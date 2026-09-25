import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";
import { requirePartnershipAccess } from "@/lib/auth/authorization";
import { errorResponse } from "@/lib/http";
import {
  balancesFor,
  effectivePolicy,
  loadPartnership,
  toTaxPolicy,
} from "@/lib/accounting/partnership-data";
import { monthStart } from "@/lib/accounting/tax";

export async function GET() {
  try {
    const sessionUser = await requireSessionUser();

    const found = await prisma.partnership.findFirst({
      where:
        sessionUser.role === "ADMIN"
          ? undefined
          : { memberships: { some: { userId: sessionUser.id, isActive: true } } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (!found) {
      return NextResponse.json({
        exists: false,
        message: "No accessible partnership exists yet for this user.",
      });
    }

    await requirePartnershipAccess(found.id, sessionUser);
    const partnership = (await loadPartnership(found.id))!;
    const policy = effectivePolicy(partnership, monthStart(new Date()));
    const property = partnership.properties[0];

    return NextResponse.json({
      exists: true,
      isAdmin: sessionUser.role === "ADMIN",
      currentUser: { id: sessionUser.id, role: sessionUser.role },
      partnership: {
        id: partnership.id,
        name: partnership.name,
        propertyId: property?.id,
        propertyName: property?.name,
        currentValuation: Number(property?.currentValuation ?? property?.initialValuation ?? 0),
        agreedRent: Number(policy.agreedRent),
      },
      taxPolicy: toTaxPolicy(policy),
      balances: balancesFor(partnership),
      memberships: partnership.memberships.map((membership) => ({
        id: membership.id,
        displayLabel: membership.displayLabel,
        userId: membership.userId,
        userName: membership.user.fullName,
        userEmail: membership.user.email,
        role: membership.role,
        initialOwnershipPct: Number(membership.initialOwnershipPct),
      })),
    });
  } catch (error) {
    return errorResponse(error, "Failed to load partnership context.");
  }
}
