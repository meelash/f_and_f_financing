import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { requireSessionUser } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    const sessionUser = await requireSessionUser();
    const body = (await request.json()) as { newPassword?: string };
    const newPassword = String(body.newPassword ?? "");

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters." },
        { status: 400 },
      );
    }

    if (!sessionUser.mustChangePassword) {
      return NextResponse.json(
        { error: "Password change is not required for this account." },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: sessionUser.id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to change password.",
      },
      { status: 400 },
    );
  }
}
