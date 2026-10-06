import { UserRole } from "@/lib/generated/prisma/enums";
import { NextResponse } from "next/server";
import { createUserFromAdmin, listAdminUsers, parseUserRole, parseUserStatus } from "@/lib/admin/users";
import { requireAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";

export const GET = withApiErrors(async (request: Request) => {
  const actor = await requireAdminUserFromRequest(request);

  const { searchParams } = new URL(request.url);
  const searchText = searchParams.get("searchText") ?? "";
  const role = parseUserRole(searchParams.get("role"));
  const status = parseUserStatus(searchParams.get("status"));

  const data = await listAdminUsers(actor, {
    searchText,
    role,
    status,
    page: Number(searchParams.get("page") ?? 1),
    pageSize: Number(searchParams.get("pageSize") ?? undefined),
  });

  return NextResponse.json({ data });
});

export const POST = withApiErrors(async (request: Request) => {
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
  const role = parseUserRole(String(payload.role ?? "")) ?? UserRole.SUBSCRIBER;

  if (!username || !password) {
    return NextResponse.json({ error: "Username e password sono obbligatori", code: "CREDENTIALS_REQUIRED" }, { status: 400 });
  }

  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Password e conferma non coincidono", code: "PASSWORD_MISMATCH" }, { status: 400 });
  }

  const user = await createUserFromAdmin(actor, {
    username,
    password,
    role,
  });

  return NextResponse.json({ data: user });
});
