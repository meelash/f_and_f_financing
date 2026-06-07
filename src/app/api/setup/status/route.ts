import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const count = await prisma.partnership.count();
    return NextResponse.json({ exists: count > 0 }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to check setup status.",
      },
      { status: 500 },
    );
  }
}
