import { UserRole, UserStatus } from "@/lib/generated/prisma/enums";
import { NextResponse } from "next/server";
import { AdminActionError, createUserFromAdmin, listAdminUsers } from "@/lib/admin/users";
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

export async function GET(request: Request) {
  try {
    const actor = await requireAdminUserFromRequest(request);

    const { searchParams } = new URL(request.url);
    const searchText = searchParams.get("searchText") ?? "";
    const role = toRole(searchParams.get("role"));
    const status = toStatus(searchParams.get("status"));

    const data = await listAdminUsers(actor, {
      searchText,
      role,
      status,
    });

    return NextResponse.json({ data });
  } catch (error) {
    return toResponseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminUserFromRequest(request);
    const payload = (await request.json()) as {
      username?: string;
      password?: string;
      confirmPassword?: string;
      role?: string;
    };

    const username = String(payload.username ?? "").trim();
    const password = String(payload.password ?? "");
    const confirmPassword = String(payload.confirmPassword ?? "");
    const role = toRole(String(payload.role ?? "")) ?? UserRole.SUBSCRIBER;

    if (!username || !password) {
      return NextResponse.json({ error: "Username e password sono obbligatori" }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Password e conferma non coincidono" }, { status: 400 });
    }

    const user = await createUserFromAdmin(actor, {
      username,
      password,
      role,
    });

    return NextResponse.json({ data: user });
  } catch (error) {
    return toResponseError(error);
  }
}