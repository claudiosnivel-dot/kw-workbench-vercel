import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled, SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { verifySessionToken } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ authenticated: true, authEnabled: false, username: "local" });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    return NextResponse.json({ authenticated: false, authEnabled: true }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true, authEnabled: true, username: session.username });
}
