import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, shouldUseSecureCookies } from "@/lib/auth/config";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    maxAge: 0,
    path: "/",
  });
  return response;
}