import { NextResponse } from "next/server";
import { isAuthEnabled } from "@/lib/auth/config";
import { verifyLoginCredentials } from "@/lib/auth/credentials";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { withApiErrors } from "@/lib/http/errors";

export const POST = withApiErrors(async (request: Request) => {
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

  const response = NextResponse.json({ success: true });
  await setSessionCookie(response, result.user);
  return response;
});