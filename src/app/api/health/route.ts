import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      ok: true,
      service: "f_and_f_financing",
      timestamp: new Date().toISOString(),
      database: "up",
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        service: "f_and_f_financing",
        timestamp: new Date().toISOString(),
        database: "down",
      },
      { status: 503 },
    );
  }
}
