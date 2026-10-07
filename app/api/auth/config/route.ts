import { NextRequest, NextResponse } from "next/server";
import { updateAuthCredentials, verifyUserPassword } from "@/lib/auth/credentials";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { errorResponse, withApiErrors } from "@/lib/http/errors";

export const PATCH = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);

  const payload = (await request.json()) as {
    currentPassword?: string;
    displayName?: string;
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

  const displayName = String(payload.displayName ?? "").trim();
  const newPassword = String(payload.newPassword ?? "");
  const confirmPassword = String(payload.confirmPassword ?? "");

  if (!displayName && !newPassword) {
    return errorResponse(400, "NO_CHANGES", "Nessuna modifica da salvare");
  }

  if (newPassword && newPassword !== confirmPassword) {
    return errorResponse(400, "PASSWORD_MISMATCH", "Nuova password e conferma non coincidono");
  }

  // Errori di validazione (400) arrivano come AppError a withApiErrors; il nome mostrato non è univoco (T-1401).
  const updatedUser = await updateAuthCredentials({
    userId: user.id,
    displayName: displayName || undefined,
    password: newPassword || undefined,
  });

  const response = NextResponse.json({
    data: {
      displayName: updatedUser.displayName,
    },
  });

  // Il cambio password ha incrementato session_version: solo questo dispositivo riceve il token nuovo.
  // Il nome mostrato non è nel token, quindi cambiarlo non riemette il cookie.
  if (newPassword) {
    await setSessionCookie(response, updatedUser);
  }

  return response;
});
