import { NextResponse } from "next/server";
import { getAdminUserDetail } from "@/lib/admin/user-detail";
import {
  changeUserEmailFromAdmin,
  deleteUserFromAdmin,
  parseUserRole,
  parseUserStatus,
  updateUserFromAdmin,
} from "@/lib/admin/users";
import { requireAdminUserFromRequest } from "@/lib/auth/current-user";
import { errorResponse, withApiErrors } from "@/lib/http/errors";
import { getClientIp } from "@/lib/security/client-ip";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Scheda dell'utente (T-3401): stesse regole di visibilità dell'elenco, quindi 404 per un utente fuori dal perimetro
 * dell'admin non root (CWE-639); workspace e registro solo per il root admin. Risposta no-store.
 */
export const GET = withApiErrors(async (request: Request, { params }: RouteContext) => {
  const actor = await requireAdminUserFromRequest(request);
  const { id } = await params;

  const detail = await getAdminUserDetail(actor, id);
  if (!detail) {
    return errorResponse(404, "NOT_FOUND", "Utente non trovato");
  }
  return NextResponse.json({ data: detail }, { headers: { "Cache-Control": "no-store" } });
});

export const PATCH = withApiErrors(async (request: Request, { params }: RouteContext) => {
  const actor = await requireAdminUserFromRequest(request);
  const { id } = await params;

  const payload = (await request.json()) as {
    email?: unknown;
    role?: string;
    status?: string;
    newPassword?: string;
    confirmPassword?: string;
  };

  // Il cambio dell'email (T-3402, solo root admin) è un'azione a sé: con email gli altri campi non si leggono.
  if (payload.email !== undefined) {
    const changed = await changeUserEmailFromAdmin(actor, { targetUserId: id, email: payload.email }, { ip: getClientIp(request) });
    return NextResponse.json({ data: changed });
  }

  const role = parseUserRole(payload.role ?? null);
  const status = parseUserStatus(payload.status ?? null);
  const newPassword = String(payload.newPassword ?? "");
  const confirmPassword = String(payload.confirmPassword ?? "");

  if (newPassword && newPassword !== confirmPassword) {
    return errorResponse(400, "PASSWORD_MISMATCH", "Password e conferma non coincidono");
  }

  const updated = await updateUserFromAdmin(
    actor,
    { targetUserId: id, role, status, newPassword: newPassword || undefined },
    { ip: getClientIp(request) }
  );

  return NextResponse.json({ data: updated });
});

export const DELETE = withApiErrors(async (request: Request, { params }: RouteContext) => {
  const actor = await requireAdminUserFromRequest(request);
  const { id } = await params;

  await deleteUserFromAdmin(actor, id, { ip: getClientIp(request) });
  return NextResponse.json({ success: true });
});
