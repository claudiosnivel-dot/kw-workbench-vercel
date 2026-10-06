import { UserRole } from "@/lib/generated/prisma/enums";
import { NextResponse } from "next/server";
import { isAuthEnabled, isPublicSignupEnabled } from "@/lib/auth/config";
import { registerUser } from "@/lib/auth/credentials";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { withApiErrors } from "@/lib/http/errors";

export const POST = withApiErrors(async (request: Request) => {
  if (!isAuthEnabled()) {
    return NextResponse.json({ error: "Registrazione non disponibile con autenticazione disabilitata", code: "REGISTRATION_UNAVAILABLE" }, { status: 400 });
  }

  if (!isPublicSignupEnabled()) {
    return NextResponse.json({ error: "Registrazione pubblica disabilitata", code: "SIGNUP_DISABLED" }, { status: 403 });
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
    return NextResponse.json({ error: "Username e password sono obbligatori", code: "CREDENTIALS_REQUIRED" }, { status: 400 });
  }

  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Password e conferma non coincidono", code: "PASSWORD_MISMATCH" }, { status: 400 });
  }

  // Username non valido (400) o già in uso (409): AppError gestiti da withApiErrors, mai error.message grezzo.
  const user = await registerUser({ username, password, role: UserRole.SUBSCRIBER });
  const response = NextResponse.json({ success: true });
  await setSessionCookie(response, user);
  return response;
});