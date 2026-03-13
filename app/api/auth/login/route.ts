import { NextResponse } from "next/server";
import { createSessionToken } from "@/lib/auth/session";
import {
  getSessionMaxAgeSeconds,
  isAuthEnabled,
  SESSION_COOKIE_NAME,
  shouldUseSecureCookies,
} from "@/lib/auth/config";
import { verifyLoginCredentials } from "@/lib/auth/credentials";

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ success: true, authEnabled: false });
  }

  const payload = (await request.json()) as {
    username?: string;
    password?: string;
  };

  const username = String(payload.username ?? "").trim();
  const password = String(payload.password ?? "");

  const user = await verifyLoginCredentials(username, password);
  if (!user) {
    return NextResponse.json({ error: "Credenziali non valide" }, { status: 401 });
  }

  const token = await createSessionToken(user.id, user.username);
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    maxAge: getSessionMaxAgeSeconds(),
    path: "/",
  });

  return response;
}
