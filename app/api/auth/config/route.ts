import { NextRequest, NextResponse } from "next/server";
import {
  getAuthConfigSnapshot,
  updateAuthCredentials,
  verifyUserPassword,
} from "@/lib/auth/credentials";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import {
  getSessionMaxAgeSeconds,
  SESSION_COOKIE_NAME,
  shouldUseSecureCookies,
} from "@/lib/auth/config";
import { createSessionToken } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const user = await requireAuthenticatedUserFromRequest(request);
  const snapshot = await getAuthConfigSnapshot(user.id);
  return NextResponse.json({ data: snapshot });
}

export async function PATCH(request: NextRequest) {
  const user = await requireAuthenticatedUserFromRequest(request);

  const payload = (await request.json()) as {
    currentPassword?: string;
    username?: string;
    newPassword?: string;
    confirmPassword?: string;
  };

  const currentPassword = String(payload.currentPassword ?? "");
  if (!currentPassword) {
    return NextResponse.json({ error: "La password attuale e obbligatoria" }, { status: 400 });
  }

  const currentValid = await verifyUserPassword(user.id, currentPassword);
  if (!currentValid) {
    return NextResponse.json({ error: "La password attuale non e valida" }, { status: 401 });
  }

  const username = String(payload.username ?? "").trim();
  const newPassword = String(payload.newPassword ?? "");
  const confirmPassword = String(payload.confirmPassword ?? "");

  if (!username && !newPassword) {
    return NextResponse.json({ error: "Nessuna modifica da salvare" }, { status: 400 });
  }

  if (newPassword && newPassword !== confirmPassword) {
    return NextResponse.json({ error: "Nuova password e conferma non coincidono" }, { status: 400 });
  }

  try {
    const updatedUser = await updateAuthCredentials({
      userId: user.id,
      username: username || undefined,
      password: newPassword || undefined,
    });

    const token = await createSessionToken({
      userId: updatedUser.id,
      username: updatedUser.username,
      role: updatedUser.role,
      status: updatedUser.status,
      isRootAdmin: updatedUser.isRootAdmin,
    });

    const response = NextResponse.json({
      data: {
        username: updatedUser.username,
      },
    });

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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore durante il salvataggio" }, { status: 400 });
  }
}