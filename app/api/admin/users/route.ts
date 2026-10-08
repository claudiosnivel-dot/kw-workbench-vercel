import { UserRole } from "@/lib/generated/prisma/enums";
import { NextResponse } from "next/server";
import { createUserFromAdmin, listAdminUsers, parseUserRole, parseUserStatus } from "@/lib/admin/users";
import { readCredentialsRequest } from "@/lib/auth/credentials-input";
import { requireAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { getClientIp } from "@/lib/security/client-ip";

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
  const read = await readCredentialsRequest(request);
  if ("invalid" in read) {
    return read.invalid;
  }

  const role = parseUserRole(String(read.payload.role ?? "")) ?? UserRole.SUBSCRIBER;
  const user = await createUserFromAdmin(actor, { ...read.credentials, role }, { ip: getClientIp(request) });

  return NextResponse.json({ data: user });
});
