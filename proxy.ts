import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled, SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { PAGE_PATH_HEADER } from "@/lib/auth/safe-next-path";
import { verifySessionToken } from "@/lib/auth/session";
import { authRequiredResponse } from "@/lib/http/auth-required";
import { getRequestId, REQUEST_ID_HEADER } from "@/lib/observability/request-id";
import { buildCsp } from "@/lib/security/csp";

const PUBLIC_PATHS = new Set([
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/session-ended",
  // Verifica dell'email e recupero password (T-1403, T-1404): si aprono dai link delle email, anche senza sessione.
  "/verify-email",
  "/api/auth/verify-email",
  "/forgot-password",
  "/reset-password",
  "/api/auth/password-reset/request",
  "/api/auth/password-reset/confirm",
  // Health check per il monitoraggio esterno (T-603): solo il percorso esatto, nessun prefisso.
  "/api/health",
  // Cron di Vercel per i job bloccati (T-1203): protetto da CRON_SECRET nella rotta.
  "/api/cron/reap-jobs",
  // Scelta della lingua (T-1301): anche dalle pagine di login e registrazione; aggiorna l'utente solo con sessione valida.
  "/api/locale",
  // Webhook di Paddle (T-1603): nessuna sessione, solo la firma HMAC verificata dalla rotta.
  "/api/billing/webhook",
]);

// Passi dei job in background (T-1203): nessuna sessione, solo la firma HMAC verificata dalla rotta.
const INTERNAL_JOBS_PREFIX = "/api/internal/jobs/";

// File di public serviti senza login: un solo segmento (es. /robots.txt) con estensione ammessa.
const PUBLIC_ROOT_FILE = /^\/[^/]+\.(?:txt|xml|ico|png|jpg|jpeg|svg|webp|webmanifest)$/;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) {
    return true;
  }

  if (pathname.startsWith(INTERNAL_JOBS_PREFIX)) {
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
 * Inoltra la richiesta con il suo x-request-id (T-602). Per le pagine genera un nonce nuovo e mette la CSP
 * sulla richiesta inoltrata (Next.js ne estrae il nonce e lo applica ai propri script) e sulla risposta (T-505).
 */
function forward(request: NextRequest, requestId: string): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  // Percorso richiesto per il gate dei termini delle pagine (T-1405): sempre sovrascritto, mai un valore del client.
  requestHeaders.set(PAGE_PATH_HEADER, request.nextUrl.pathname + request.nextUrl.search);

  if (!isPageRequest(request)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(
    nonce,
    process.env.NODE_ENV === "development",
    process.env.NEXT_PUBLIC_SENTRY_DSN,
    process.env.PADDLE_ENV?.trim(),
    Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim())
  );
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

async function route(request: NextRequest, requestId: string): Promise<Response> {
  if (!isAuthEnabled()) {
    return forward(request, requestId);
  }

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return forward(request, requestId);
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (session) {
    return forward(request, requestId);
  }

  if (pathname.startsWith("/api/")) {
    return authRequiredResponse({ requestId });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

/** Ogni risposta del proxy porta l'x-request-id assegnato alla richiesta (T-602). */
export async function proxy(request: NextRequest) {
  const requestId = getRequestId(request);
  const response = await route(request, requestId);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
