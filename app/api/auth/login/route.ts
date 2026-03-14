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

  const result = await verifyLoginCredentials(username, password);
  if (!result.user) {
    if (result.reason === "SUSPENDED") {
      return NextResponse.json({ error: "Account sospeso. Contatta l'amministratore." }, { status: 403 });
    }

    return NextResponse.json({ error: "Credenziali non valide" }, { status: 401 });
  }

  const token = await createSessionToken({
    userId: result.user.id,
    username: result.user.username,
    role: result.user.role,
    status: result.user.status,
    isRootAdmin: result.user.isRootAdmin,
    themeMode: result.user.themeMode,
    fontScaleMode: result.user.fontScaleMode,
    colorVisionMode: result.user.colorVisionMode,
  });

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