import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

type AttemptWindow = {
  failures: number;
  resetAt: number;
};

const attemptsByIp = new Map<string, AttemptWindow>();

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; password?: string };
  const ip = getClientIp(request);

  const blockedForSeconds = getBlockedSeconds(ip);
  if (blockedForSeconds > 0) {
    return NextResponse.json(
      { error: "Too many failed login attempts. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(blockedForSeconds),
        },
      },
    );
  }

  if (!body.email || !body.password) {
    return NextResponse.json({ error: "email and password are required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase().trim() },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      passwordHash: true,
      mustChangePassword: true,
    },
  });

  if (!user || !user.passwordHash) {
    noteFailedAttempt(ip);
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const validPassword = await verifyPassword(body.password, user.passwordHash);
  if (!validPassword) {
    noteFailedAttempt(ip);
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  clearAttempts(ip);

  const response = NextResponse.json(
    {
      ok: true,
      requiresPasswordChange: user.mustChangePassword,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    },
    { status: 200 },
  );

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: user.id,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

function getBlockedSeconds(ip: string): number {
  const now = Date.now();
  const entry = attemptsByIp.get(ip);

  if (!entry) {
    return 0;
  }

  if (entry.resetAt <= now) {
    attemptsByIp.delete(ip);
    return 0;
  }

  if (entry.failures >= LOGIN_MAX_ATTEMPTS) {
    return Math.ceil((entry.resetAt - now) / 1000);
  }

  return 0;
}

function noteFailedAttempt(ip: string) {
  const now = Date.now();
  const entry = attemptsByIp.get(ip);

  if (!entry || entry.resetAt <= now) {
    attemptsByIp.set(ip, {
      failures: 1,
      resetAt: now + LOGIN_WINDOW_MS,
    });
    return;
  }

  attemptsByIp.set(ip, {
    failures: entry.failures + 1,
    resetAt: entry.resetAt,
  });
}

function clearAttempts(ip: string) {
  attemptsByIp.delete(ip);
}
