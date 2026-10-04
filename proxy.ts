import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled, SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { verifySessionToken } from "@/lib/auth/session";
import { authRequiredResponse } from "@/lib/http/auth-required";
import { buildCsp } from "@/lib/security/csp";

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

// Pagina vera: né API né file di Next né prefetch di next/link (come il matcher della guida CSP di Next.js).
function isPageRequest(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) {
    return false;
  }

  return !request.headers.has("next-router-prefetch") && request.headers.get("purpose") !== "prefetch";
}

/**
 * Inoltra la richiesta. Per le pagine genera un nonce nuovo e mette la CSP sulla richiesta inoltrata
 * (Next.js ne estrae il nonce e lo applica ai propri script) e sulla risposta (T-505).
 */
function forward(request: NextRequest): NextResponse {
  if (!isPageRequest(request)) {
    return NextResponse.next();
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export async function proxy(request: NextRequest) {
  if (!isAuthEnabled()) {
    return forward(request);
  }

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return forward(request);
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (session) {
    return forward(request);
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
