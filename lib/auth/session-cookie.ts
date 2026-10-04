import type { NextResponse } from "next/server";
import { getSessionMaxAgeSeconds, SESSION_COOKIE_NAME, shouldUseSecureCookies } from "@/lib/auth/config";
import { createSessionToken } from "@/lib/auth/session";

function cookieAttributes(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureCookies(),
    maxAge,
    path: "/",
  };
}

/** Unico punto che firma il token e imposta il cookie di sessione (login, register, auth/config). */
export async function setSessionCookie(
  response: NextResponse,
  user: { id: string; sessionVersion: number }
): Promise<void> {
  const token = await createSessionToken({ userId: user.id, sessionVersion: user.sessionVersion });
  response.cookies.set({ name: SESSION_COOKIE_NAME, value: token, ...cookieAttributes(getSessionMaxAgeSeconds()) });
}

/** Azzera il cookie di sessione con gli stessi attributi con cui viene emesso. */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({ name: SESSION_COOKIE_NAME, value: "", ...cookieAttributes(0) });
}
