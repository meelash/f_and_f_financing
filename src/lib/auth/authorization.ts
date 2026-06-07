import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth/session";

export async function requirePartnershipAccess(partnershipId: string, sessionUser: SessionUser) {
  if (sessionUser.role === "ADMIN") {
    return;
  }

  const membership = await prisma.partnerMembership.findFirst({
    where: {
      partnershipId,
      userId: sessionUser.id,
      isActive: true,
    },
    select: { id: true },
  });

  if (!membership) {
    throw new Error("FORBIDDEN");
  }
}

export async function requireMembershipInPartnership(
  partnershipId: string,
  membershipId: string,
  sessionUser: SessionUser,
) {
  await requirePartnershipAccess(partnershipId, sessionUser);

  const membership = await prisma.partnerMembership.findFirst({
    where: {
      id: membershipId,
      partnershipId,
      isActive: true,
    },
    select: { id: true },
  });

  if (!membership) {
    throw new Error("FORBIDDEN");
  }
}