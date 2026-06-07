import "dotenv/config";
import {
  PrismaClient,
  ContributionKind,
  MembershipRole,
  Role,
} from "../src/generated/prisma/client";
import { createPrismaAdapter } from "../src/lib/prisma-adapter";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

async function main() {
  const ownerEmail = "owner@example.com";
  const partnerEmail = "partner@example.com";
  const partnershipName = "32 Barraclough Demo Partnership";
  const ownerPassword = "OwnerDemo123!";
  const partnerPassword = "PartnerDemo123!";

  const ownerPasswordHash = await hashPassword(ownerPassword);
  const partnerPasswordHash = await hashPassword(partnerPassword);

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      fullName: "Owner Occupant",
      role: Role.ADMIN,
      passwordHash: ownerPasswordHash,
    },
    create: {
      email: ownerEmail,
      fullName: "Owner Occupant",
      role: Role.ADMIN,
      passwordHash: ownerPasswordHash,
    },
  });

  const partner = await prisma.user.upsert({
    where: { email: partnerEmail },
    update: {
      fullName: "Financing Partner",
      role: Role.PARTNER,
      passwordHash: partnerPasswordHash,
    },
    create: {
      email: partnerEmail,
      fullName: "Financing Partner",
      role: Role.PARTNER,
      passwordHash: partnerPasswordHash,
    },
  });

  const existingPartnership = await prisma.partnership.findFirst({
    where: { name: partnershipName },
    select: { id: true },
  });

  if (existingPartnership) {
    await prisma.partnership.delete({ where: { id: existingPartnership.id } });
  }

  const partnership = await prisma.partnership.create({
    data: {
      name: partnershipName,
      baseCurrency: "USD",
      properties: {
        create: {
          name: "32 Barraclough",
          addressLine1: "32 Barraclough",
          city: "Toronto",
          stateProvince: "ON",
          country: "Canada",
          acquiredOn: new Date("2026-01-01T00:00:00.000Z"),
          initialValuation: "285300.00",
          currentValuation: "285300.00",
        },
      },
      memberships: {
        create: [
          {
            userId: owner.id,
            role: MembershipRole.OCCUPANT,
            displayLabel: "Owner Occupant",
            initialOwnershipPct: "50.0000",
          },
          {
            userId: partner.id,
            role: MembershipRole.INVESTOR,
            displayLabel: "Financing Partner",
            initialOwnershipPct: "50.0000",
          },
        ],
      },
      monthlyPolicies: {
        create: {
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          agreedRent: "2200.00",
          note: "Initial agreed monthly rent.",
        },
      },
    },
    include: {
      properties: true,
      memberships: true,
    },
  });

  const property = partnership.properties[0];
  const ownerMembership = partnership.memberships.find(
    (membership) => membership.userId === owner.id,
  );
  const partnerMembership = partnership.memberships.find(
    (membership) => membership.userId === partner.id,
  );

  if (!property || !ownerMembership || !partnerMembership) {
    throw new Error("Seed setup failed to create property and memberships.");
  }

  await prisma.capitalContribution.createMany({
    data: [
      {
        partnershipId: partnership.id,
        propertyId: property.id,
        membershipId: ownerMembership.id,
        kind: ContributionKind.PURCHASE,
        amount: "65000.00",
        effectiveDate: new Date("2026-01-01T00:00:00.000Z"),
        note: "Initial owner cash contribution.",
      },
      {
        partnershipId: partnership.id,
        propertyId: property.id,
        membershipId: partnerMembership.id,
        kind: ContributionKind.PURCHASE,
        amount: "65000.00",
        effectiveDate: new Date("2026-01-01T00:00:00.000Z"),
        note: "Initial partner cash contribution.",
      },
      {
        partnershipId: partnership.id,
        propertyId: property.id,
        membershipId: ownerMembership.id,
        kind: ContributionKind.CLOSING_COST,
        amount: "8200.00",
        effectiveDate: new Date("2026-01-03T00:00:00.000Z"),
        note: "Closing costs paid by owner.",
      },
      {
        partnershipId: partnership.id,
        propertyId: property.id,
        membershipId: ownerMembership.id,
        kind: ContributionKind.ROOF,
        amount: "12000.00",
        effectiveDate: new Date("2026-01-14T00:00:00.000Z"),
        note: "New roof.",
      },
      {
        partnershipId: partnership.id,
        propertyId: property.id,
        membershipId: ownerMembership.id,
        kind: ContributionKind.APPLIANCES,
        amount: "4100.00",
        effectiveDate: new Date("2026-01-18T00:00:00.000Z"),
        note: "Appliances and startup items.",
      },
    ],
  });

  await prisma.taxPayment.create({
    data: {
      partnershipId: partnership.id,
      paidByUserId: owner.id,
      paidByMembershipId: ownerMembership.id,
      amount: "3600.00",
      coverageMonths: 6,
      paidOn: new Date("2026-01-05T00:00:00.000Z"),
      reimbursementStart: new Date("2026-01-01T00:00:00.000Z"),
      note: "Owner prepaid six months of taxes.",
    },
  });

  await prisma.ownershipSnapshot.createMany({
    data: [
      {
        partnershipId: partnership.id,
        membershipId: ownerMembership.id,
        asOf: new Date("2026-01-01T00:00:00.000Z"),
        ownershipPct: "50.0000",
        equityValue: "142650.00",
      },
      {
        partnershipId: partnership.id,
        membershipId: partnerMembership.id,
        asOf: new Date("2026-01-01T00:00:00.000Z"),
        ownershipPct: "50.0000",
        equityValue: "142650.00",
      },
    ],
  });

  console.log(
    JSON.stringify(
      {
        partnershipId: partnership.id,
        propertyId: property.id,
        ownerMembershipId: ownerMembership.id,
        partnerMembershipId: partnerMembership.id,
        loginCredentials: {
          owner: {
            email: ownerEmail,
            password: ownerPassword,
          },
          partner: {
            email: partnerEmail,
            password: partnerPassword,
          },
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
