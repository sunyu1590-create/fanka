import { NextResponse, type NextRequest } from "next/server";

/**
 * Returns the country code inferred by Vercel from the request's public egress.
 * The endpoint does not persist or expose the caller's IP address.
 */
export async function GET(request: NextRequest) {
  const countryCode = request.headers.get("x-vercel-ip-country")?.trim().toUpperCase() ?? null;
  return NextResponse.json(
    { countryCode },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
