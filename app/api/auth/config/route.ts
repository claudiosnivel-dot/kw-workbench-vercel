import { NextRequest, NextResponse } from "next/server";
import { updateAuthCredentials, verifyUserPassword } from "@/lib/auth/credentials";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { errorResponse, withApiErrors } from "@/lib/http/errors";

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
    return errorResponse(400, "CURRENT_PASSWORD_REQUIRED", "La password attuale è obbligatoria");
  }

  const currentValid = await verifyUserPassword(user.id, currentPassword);
  if (!currentValid) {
    return errorResponse(401, "CURRENT_PASSWORD_INVALID", "La password attuale non è valida");
  }

  const username = String(payload.username ?? "").trim();
  const newPassword = String(payload.newPassword ?? "");
  const confirmPassword = String(payload.confirmPassword ?? "");

  if (!username && !newPassword) {
    return errorResponse(400, "NO_CHANGES", "Nessuna modifica da salvare");
  }

  if (newPassword && newPassword !== confirmPassword) {
    return errorResponse(400, "PASSWORD_MISMATCH", "Nuova password e conferma non coincidono");
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
