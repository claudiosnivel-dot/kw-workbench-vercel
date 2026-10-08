import { NextResponse } from "next/server";
import { deleteUserFromAdmin, parseUserRole, parseUserStatus, updateUserFromAdmin } from "@/lib/admin/users";
import { requireAdminUserFromRequest } from "@/lib/auth/current-user";
import { errorResponse, withApiErrors } from "@/lib/http/errors";
import { getClientIp } from "@/lib/security/client-ip";

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withApiErrors(async (request: Request, { params }: RouteContext) => {
  const actor = await requireAdminUserFromRequest(request);
  const { id } = await params;

  const payload = (await request.json()) as {
    role?: string;
    status?: string;
    newPassword?: string;
    confirmPassword?: string;
  };

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
