import { NextRequest, NextResponse } from "next/server";
import { updateAuthCredentials, verifyUserPassword } from "@/lib/auth/credentials";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { withApiErrors } from "@/lib/http/errors";

export const PATCH = withApiErrors(async (request: NextRequest) => {
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

  // Errori di validazione (400) e username già in uso (409) arrivano come AppError a withApiErrors.
  const updatedUser = await updateAuthCredentials({
    userId: user.id,
    username: username || undefined,
    password: newPassword || undefined,
  });

  const response = NextResponse.json({
    data: {
      username: updatedUser.username,
    },
  });

  // Il cambio password ha incrementato session_version: solo questo dispositivo riceve il token nuovo.
  // Lo username non è nel token, quindi cambiarlo non riemette il cookie.
  if (newPassword) {
    await setSessionCookie(response, updatedUser);
  }

  return response;
});
