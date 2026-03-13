import { NextResponse } from "next/server";
import {
  getSessionMaxAgeSeconds,
  isAuthEnabled,
  SESSION_COOKIE_NAME,
  shouldUseSecureCookies,
} from "@/lib/auth/config";
import { registerUser } from "@/lib/auth/credentials";
import { createSessionToken } from "@/lib/auth/session";

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ error: "Registrazione non disponibile con autenticazione disabilitata" }, { status: 400 });
  }

  const payload = (await request.json()) as {
    username?: string;
    password?: string;
    confirmPassword?: string;
  };

  const username = String(payload.username ?? "").trim();
  const password = String(payload.password ?? "");
  const confirmPassword = String(payload.confirmPassword ?? "");

  if (!username || !password) {
    return NextResponse.json({ error: "Username e password sono obbligatori" }, { status: 400 });
  }

  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Password e conferma non coincidono" }, { status: 400 });
  }

  try {
    const user = await registerUser({ username, password });
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
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Registrazione non riuscita" }, { status: 400 });
  }
}
