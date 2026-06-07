import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { requireSessionUser } from "@/lib/auth/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const sessionUser = await requireSessionUser({ roles: ["ADMIN"] });
    const { userId } = await params;

    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }

    const body = (await request.json()) as { temporaryPassword?: string };
    const temporaryPassword = String(body.temporaryPassword ?? "");

    if (temporaryPassword.length < 8) {
      return NextResponse.json(
        { error: "temporaryPassword must be at least 8 characters." },
        { status: 400 },
      );
    }

    // Restrict resets to users in partnerships the admin can access.
    const hasAccess = await prisma.partnerMembership.findFirst({
      where: {
        userId,
        partnership: {
          memberships: {
            some: {
              userId: sessionUser.id,
              isActive: true,
            },
          },
        },
      },
      select: { id: true },
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Target user is not accessible." }, { status: 403 });
    }

    const passwordHash = await hashPassword(temporaryPassword);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: true,
      },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admin role required." }, { status: 403 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to reset password.",
      },
      { status: 400 },
    );
  }
}
