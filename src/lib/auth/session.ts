import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "ffp_session_user";

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
    },
  });

  if (!user) {
    return null;
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
