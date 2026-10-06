import { NextResponse } from "next/server";
import { deleteUserFromAdmin, parseUserRole, parseUserStatus, updateUserFromAdmin } from "@/lib/admin/users";
import { requireAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";

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
    return NextResponse.json({ error: "Password e conferma non coincidono", code: "PASSWORD_MISMATCH" }, { status: 400 });
  }

  const updated = await updateUserFromAdmin(actor, {
    targetUserId: id,
    role,
    status,
    newPassword: newPassword || undefined,
  });

  return NextResponse.json({ data: updated });
});

export const DELETE = withApiErrors(async (request: Request, { params }: RouteContext) => {
  const actor = await requireAdminUserFromRequest(request);
  const { id } = await params;

  await deleteUserFromAdmin(actor, id);
  return NextResponse.json({ success: true });
});
