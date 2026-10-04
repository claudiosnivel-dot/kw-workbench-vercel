import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session-cookie";
import { withApiErrors } from "@/lib/http/errors";

export const POST = withApiErrors(async () => {
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  return response;
});
