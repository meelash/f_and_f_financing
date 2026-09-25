import { NextResponse } from "next/server";

/** Maps thrown errors to JSON responses: UNAUTHORIZED → 401, FORBIDDEN → 403, anything else → 400. */
export function errorResponse(error: unknown, fallback: string) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json({ error: "Access denied for this partnership." }, { status: 403 });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 400 },
  );
}
