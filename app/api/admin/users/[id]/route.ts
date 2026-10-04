import { UserRole, UserStatus } from "@/lib/generated/prisma/enums";
import { NextResponse } from "next/server";
import { AdminActionError, deleteUserFromAdmin, updateUserFromAdmin } from "@/lib/admin/users";
import { AuthRequiredError, ForbiddenError, requireAdminUserFromRequest } from "@/lib/auth/current-user";

function toRole(value: string | null): UserRole | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized === UserRole.ADMIN) return UserRole.ADMIN;
  if (normalized === UserRole.SUBSCRIBER) return UserRole.SUBSCRIBER;
  return undefined;
}

function toStatus(value: string | null): UserStatus | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized === UserStatus.ACTIVE) return UserStatus.ACTIVE;
  if (normalized === UserStatus.SUSPENDED) return UserStatus.SUSPENDED;
  return undefined;
}

function toResponseError(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: "Operazione non autorizzata" }, { status: 403 });
  }

  if (error instanceof AdminActionError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json({ error: error instanceof Error ? error.message : "Errore interno" }, { status: 500 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminUserFromRequest(request);
    const { id } = await params;

    const payload = (await request.json()) as {
      role?: string;
      status?: string;
      newPassword?: string;
      confirmPassword?: string;
    };

    const role = toRole(payload.role ?? null);
    const status = toStatus(payload.status ?? null);
    const newPassword = String(payload.newPassword ?? "");
    const confirmPassword = String(payload.confirmPassword ?? "");

    if (newPassword && newPassword !== confirmPassword) {
      return NextResponse.json({ error: "Password e conferma non coincidono" }, { status: 400 });
    }

    const updated = await updateUserFromAdmin(actor, {
      targetUserId: id,
      role,
      status,
      newPassword: newPassword || undefined,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return toResponseError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminUserFromRequest(request);
    const { id } = await params;

    await deleteUserFromAdmin(actor, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return toResponseError(error);
  }
}