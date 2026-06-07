import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";
import { requirePartnershipAccess } from "@/lib/auth/authorization";

export async function GET() {
  try {
    const sessionUser = await requireSessionUser();

    const partnership = await prisma.partnership.findFirst({
      where:
        sessionUser.role === "ADMIN"
          ? undefined
          : {
              memberships: {
                some: {
                  userId: sessionUser.id,
                  isActive: true,
                },
              },
            },
      orderBy: { createdAt: "desc" },
      include: {
        memberships: {
          include: {
            user: true,
          },
        },
        properties: true,
        monthlyPolicies: {
          orderBy: { effectiveFrom: "desc" },
          take: 1,
        },
        taxPayments: {
          orderBy: [{ reimbursementStart: "desc" }, { createdAt: "desc" }],
        },
        monthlyPayments: {
          select: {
            taxReimbursement: true,
          },
        },
      },
    });

    if (!partnership) {
      return NextResponse.json({
        exists: false,
        message: "No accessible partnership exists yet for this user.",
      });
    }

    await requirePartnershipAccess(partnership.id, sessionUser);

    const activeTaxPolicy = partnership.taxPayments.find((payment) =>
      (payment.note ?? "").startsWith("[POLICY]"),
    );

    const taxMode = activeTaxPolicy
      ? (activeTaxPolicy.note ?? "").includes("mode=RESERVE")
        ? "RESERVE"
        : "OUT_OF_POCKET"
      : null;

    const reserveContributions = partnership.monthlyPayments.reduce((sum, payment) => {
      const value = Number(payment.taxReimbursement ?? 0);
      return sum + (value < 0 ? -value : 0);
    }, 0);

    const reserveReimbursements = partnership.monthlyPayments.reduce((sum, payment) => {
      const value = Number(payment.taxReimbursement ?? 0);
      return sum + (value > 0 ? value : 0);
    }, 0);

    const outOfPocketInflows = partnership.taxPayments
      .filter((payment) => (payment.note ?? "").startsWith("[OUT_OF_POCKET_PAYMENT]"))
      .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

    const reserveOutflows = partnership.taxPayments
      .filter((payment) => (payment.note ?? "").startsWith("[RESERVE_PAYMENT]"))
      .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

    const taxReserveBalance =
      reserveContributions + outOfPocketInflows - reserveReimbursements - reserveOutflows;

    return NextResponse.json({
      exists: true,
      isAdmin: sessionUser.role === "ADMIN",
      currentUser: {
        id: sessionUser.id,
        role: sessionUser.role,
      },
      partnership: {
        id: partnership.id,
        name: partnership.name,
        propertyId: partnership.properties[0]?.id,
        propertyName: partnership.properties[0]?.name,
        currentValuation: Number(partnership.properties[0]?.currentValuation ?? 0),
        agreedRent: Number(partnership.monthlyPolicies[0]?.agreedRent ?? 0),
      },
      taxSettings: {
        mode: taxMode,
        amount: activeTaxPolicy ? Number(activeTaxPolicy.amount ?? 0) : 0,
        coverageMonths: activeTaxPolicy?.coverageMonths ?? 12,
        monthlyAmount:
          activeTaxPolicy && activeTaxPolicy.coverageMonths > 0
            ? Number(activeTaxPolicy.amount ?? 0) / activeTaxPolicy.coverageMonths
            : 0,
        reserveBalance: taxReserveBalance,
      },
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
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this partnership." }, { status: 403 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load demo context.",
      },
      { status: 400 },
    );
  }
}
