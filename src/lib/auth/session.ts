import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "ffp_session_user";

// Only write lastSeenAt when it's this stale, so every request doesn't hit the DB with a write.
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: "ADMIN" | "PARTNER";
  mustChangePassword: boolean;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      mustChangePassword: true,
      lastSeenAt: true,
    },
  });

  if (!user) {
    return null;
  }

  if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await recordUserSeen(user.id);
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

export async function requireSessionUser(options?: { roles?: Array<"ADMIN" | "PARTNER"> }) {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    throw new Error("UNAUTHORIZED");
  }

  if (options?.roles && !options.roles.includes(sessionUser.role)) {
    throw new Error("FORBIDDEN");
  }

  return sessionUser;
}

// Raw SQL so activity tracking doesn't bump User.updatedAt.
async function recordUserSeen(userId: string) {
  try {
    await prisma.$executeRaw`UPDATE "User" SET "lastSeenAt" = NOW() WHERE "id" = ${userId}::uuid`;
  } catch (error) {
    console.error("Failed to record lastSeenAt", error);
  }
}

export async function recordUserLogin(userId: string) {
  try {
    await prisma.$executeRaw`
      UPDATE "User"
      SET "lastLoginAt" = NOW(), "lastSeenAt" = NOW(), "loginCount" = "loginCount" + 1
      WHERE "id" = ${userId}::uuid
    `;
  } catch (error) {
    console.error("Failed to record login", error);
  }
}
