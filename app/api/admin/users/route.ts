import { UserRole } from "@/lib/generated/prisma/enums";
import { NextResponse } from "next/server";
import { createUserFromAdmin, listAdminUsers, parseUserRole, parseUserStatus } from "@/lib/admin/users";
import { credentialsInputError, readCredentialsInput } from "@/lib/auth/credentials-input";
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
  const payload = (await request.json()) as { username?: string; password?: string; confirmPassword?: string; role?: string };
  const credentials = readCredentialsInput(payload);
  const invalid = credentialsInputError(credentials);
  if (invalid) {
    return invalid;
  }

  const role = parseUserRole(String(payload.role ?? "")) ?? UserRole.SUBSCRIBER;
  const user = await createUserFromAdmin(actor, { username: credentials.username, password: credentials.password, role });

  return NextResponse.json({ data: user });
});
