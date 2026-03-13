import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled } from "@/lib/auth/config";
import { getOptionalAuthenticatedUserFromRequest } from "@/lib/auth/current-user";

export async function GET(request: NextRequest) {
  const user = await getOptionalAuthenticatedUserFromRequest(request);

  if (!isAuthEnabled()) {
    if (!user) {
      return NextResponse.json({ authenticated: false, authEnabled: false }, { status: 500 });
    }

    return NextResponse.json({
      authenticated: true,
      authEnabled: false,
      userId: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      isRootAdmin: user.isRootAdmin,
    });
  }

  if (!user) {
    return NextResponse.json({ authenticated: false, authEnabled: true }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    authEnabled: true,
    userId: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    isRootAdmin: user.isRootAdmin,
  });
}