import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";

export async function POST(request: Request) {
  try {
    const partnershipCount = await prisma.partnership.count();
    const isFirstRun = partnershipCount === 0;
    const isProduction = process.env.NODE_ENV === "production";
    let sessionUser: Awaited<ReturnType<typeof requireSessionUser>> | null = null;

    if (!isFirstRun) {
      try {
        sessionUser = await requireSessionUser();
      } catch (error) {
        if (error instanceof Error && error.message === "UNAUTHORIZED") {
          if (isProduction) {
            return NextResponse.json(
              { error: "Authentication required." },
              { status: 401 },
            );
          }
        } else {
          throw error;
        }
      }

      if (sessionUser && sessionUser.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Only admin users can initialize additional partnerships." },
          { status: 403 },
        );
      }
    }

    const body = (await request.json()) as {
      partnershipName?: string;
      propertyName?: string;
      startDate?: string;
      addressLine1?: string;
      city?: string;
      stateProvince?: string;
      country?: string;
      initialValuation?: number;
      agreedRent?: number;
      occupantName?: string;
      occupantEmail?: string;
      occupantPassword?: string;
      investorName?: string;
      investorEmail?: string;
      investorPassword?: string;
      occupantOwnershipPct?: number;
      investorOwnershipPct?: number;
      occupantContribution?: number;
      investorContribution?: number;
      taxMode?: "OUT_OF_POCKET" | "RESERVE";
      taxAmount?: number;
      taxCoverageMonths?: number;
    };

    const requiredFields = [
      "partnershipName",
      "propertyName",
      "startDate",
      "initialValuation",
      "agreedRent",
      "occupantName",
      "occupantEmail",
      "occupantPassword",
      "investorName",
      "investorEmail",
      "investorPassword",
      "occupantOwnershipPct",
      "investorOwnershipPct",
      "occupantContribution",
      "investorContribution",
    ] as const;

    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null || body[field] === "") {
        return NextResponse.json({ error: `${field} is required.` }, { status: 400 });
      }
    }

    const totalOwnership = Number(body.occupantOwnershipPct) + Number(body.investorOwnershipPct);
    if (Math.abs(totalOwnership - 100) > 0.001) {
      return NextResponse.json(
        { error: "occupantOwnershipPct + investorOwnershipPct must equal 100." },
        { status: 400 },
      );
    }

    if (String(body.occupantPassword).length < 8 || String(body.investorPassword).length < 8) {
      return NextResponse.json(
        { error: "occupantPassword and investorPassword must be at least 8 characters." },
        { status: 400 },
      );
    }

    if (body.taxAmount !== undefined || body.taxCoverageMonths !== undefined || body.taxMode) {
      if (
        typeof body.taxAmount !== "number" ||
        Number.isNaN(body.taxAmount) ||
        body.taxAmount <= 0
      ) {
        return NextResponse.json({ error: "taxAmount must be a positive number." }, { status: 400 });
      }

      if (body.taxCoverageMonths !== 6 && body.taxCoverageMonths !== 12) {
        return NextResponse.json(
          { error: "taxCoverageMonths must be 6 or 12." },
          { status: 400 },
        );
      }

      if (body.taxMode !== "OUT_OF_POCKET" && body.taxMode !== "RESERVE") {
        return NextResponse.json(
          { error: "taxMode must be OUT_OF_POCKET or RESERVE." },
          { status: 400 },
        );
      }
    }

    const setupStartDate = new Date(String(body.startDate));
    if (Number.isNaN(setupStartDate.getTime())) {
      return NextResponse.json({ error: "startDate must be a valid date." }, { status: 400 });
    }

    const occupantPasswordHash = await hashPassword(String(body.occupantPassword));
    const investorPasswordHash = await hashPassword(String(body.investorPassword));

    const result = await prisma.$transaction(async (tx) => {
      const occupant = await tx.user.upsert({
        where: { email: String(body.occupantEmail) },
        update: {
          fullName: String(body.occupantName),
          role: "ADMIN",
          passwordHash: occupantPasswordHash,
          mustChangePassword: true,
        },
        create: {
          email: String(body.occupantEmail),
          fullName: String(body.occupantName),
          role: "ADMIN",
          passwordHash: occupantPasswordHash,
          mustChangePassword: true,
        },
      });

      const investor = await tx.user.upsert({
        where: { email: String(body.investorEmail) },
        update: {
          fullName: String(body.investorName),
          role: "PARTNER",
          passwordHash: investorPasswordHash,
          mustChangePassword: true,
        },
        create: {
          email: String(body.investorEmail),
          fullName: String(body.investorName),
          role: "PARTNER",
          passwordHash: investorPasswordHash,
          mustChangePassword: true,
        },
      });

      const partnership = await tx.partnership.create({
        data: {
          name: String(body.partnershipName),
          baseCurrency: "USD",
          properties: {
            create: {
              name: String(body.propertyName),
              addressLine1: body.addressLine1,
              city: body.city,
              stateProvince: body.stateProvince,
              country: body.country,
              acquiredOn: setupStartDate,
              initialValuation: Number(body.initialValuation),
              currentValuation: Number(body.initialValuation),
            },
          },
          memberships: {
            create: [
              {
                userId: occupant.id,
                role: "OCCUPANT",
                displayLabel: String(body.occupantName),
                initialOwnershipPct: Number(body.occupantOwnershipPct),
              },
              {
                userId: investor.id,
                role: "INVESTOR",
                displayLabel: String(body.investorName),
                initialOwnershipPct: Number(body.investorOwnershipPct),
              },
            ],
          },
          monthlyPolicies: {
            create: {
              effectiveFrom: setupStartDate,
              agreedRent: Number(body.agreedRent),
            },
          },
        },
        include: {
          properties: true,
          memberships: true,
        },
      });

      const occupantMembership = partnership.memberships.find(
        (membership) => membership.userId === occupant.id,
      );
      const investorMembership = partnership.memberships.find(
        (membership) => membership.userId === investor.id,
      );

      if (!occupantMembership || !investorMembership) {
        throw new Error("Failed to create memberships during setup.");
      }

      await tx.capitalContribution.createMany({
        data: [
          {
            partnershipId: partnership.id,
            propertyId: partnership.properties[0].id,
            membershipId: occupantMembership.id,
            kind: "PURCHASE",
            amount: Number(body.occupantContribution),
            effectiveDate: setupStartDate,
            note: "Initial occupant contribution from setup wizard",
          },
          {
            partnershipId: partnership.id,
            propertyId: partnership.properties[0].id,
            membershipId: investorMembership.id,
            kind: "PURCHASE",
            amount: Number(body.investorContribution),
            effectiveDate: setupStartDate,
            note: "Initial investor contribution from setup wizard",
          },
        ],
      });

      await tx.ownershipSnapshot.createMany({
        data: [
          {
            partnershipId: partnership.id,
            membershipId: occupantMembership.id,
            asOf: setupStartDate,
            ownershipPct: Number(body.occupantOwnershipPct),
            equityValue: (Number(body.occupantOwnershipPct) / 100) * Number(body.initialValuation),
          },
          {
            partnershipId: partnership.id,
            membershipId: investorMembership.id,
            asOf: setupStartDate,
            ownershipPct: Number(body.investorOwnershipPct),
            equityValue: (Number(body.investorOwnershipPct) / 100) * Number(body.initialValuation),
          },
        ],
      });

      if (body.taxAmount && body.taxCoverageMonths && body.taxMode) {
        await tx.taxPayment.create({
          data: {
            partnershipId: partnership.id,
            paidByMembershipId:
              body.taxMode === "OUT_OF_POCKET" ? occupantMembership.id : null,
            amount: body.taxAmount,
            coverageMonths: body.taxCoverageMonths,
            paidOn: setupStartDate,
            reimbursementStart: setupStartDate,
            note: `[POLICY] mode=${body.taxMode}`,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          partnershipId: partnership.id,
          actorId: sessionUser?.id ?? occupant.id,
          entityType: "PARTNERSHIP",
          entityId: partnership.id,
          action: "CREATE",
          afterData: {
            wizard: true,
            partnershipName: body.partnershipName,
            propertyName: body.propertyName,
          },
        },
      });

      return {
        partnershipId: partnership.id,
        propertyId: partnership.properties[0].id,
        occupantMembershipId: occupantMembership.id,
        investorMembershipId: investorMembership.id,
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to initialize setup.",
      },
      { status: 400 },
    );
  }
}
