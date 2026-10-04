import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled, SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { verifySessionToken } from "@/lib/auth/session";
import { authRequiredResponse } from "@/lib/http/auth-required";

const PUBLIC_PATHS = new Set([
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/auth/session-ended",
]);

// File di public serviti senza login: un solo segmento (es. /robots.txt) con estensione ammessa.
const PUBLIC_ROOT_FILE = /^\/[^/]+\.(?:txt|xml|ico|png|jpg|jpeg|svg|webp|webmanifest)$/;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) {
    return true;
  }

  if (pathname.startsWith("/_next/") || pathname === "/favicon.ico") {
    return true;
  }

  if (pathname.startsWith("/.well-known/")) {
    return true;
  }

  return PUBLIC_ROOT_FILE.test(pathname);
}

export async function proxy(request: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return authRequiredResponse();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
