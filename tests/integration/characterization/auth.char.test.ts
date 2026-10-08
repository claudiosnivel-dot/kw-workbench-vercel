// Caratterizzazione di T-104: fotografa login, registrazione, logout, sessione e middleware
// così come sono oggi, difetti noti compresi. Le asserzioni marcate impacted-by cambiano
// solo con il task indicato e passando da gate umano.
// Oracolo di non regressione degli upgrade di 04-stack-upgrade (snapshot invariati):
// covers: AC-401-3
// covers: AC-403-4
// Oracolo di T-1102: il consolidamento dei duplicati non cambia il comportamento fotografato.
// covers: AC-1102-4
import { UserStatus } from "@/lib/generated/prisma/enums";
import { NextRequest } from "next/server";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as register } from "@/app/api/auth/register/route";
import LoginPage from "@/app/login/page";
import { LoginForm } from "@/components/login-form";
import { resetEnvForTests } from "@/lib/env";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";
import { prisma } from "@/lib/prisma";
// T-404: con Next 16 il middleware è proxy.ts (stessa logica, funzione rinominata).
import { proxy as middleware } from "@/proxy";
import { createUserWithSession } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { callRoute } from "../../helpers/http";
import { setCommercialLaunchForTests } from "../../helpers/launch";
import { configureTestTurnstile, TEST_TURNSTILE_TOKEN } from "../../helpers/turnstile";

// Da T-302 la pagina di login legge l'utente dai cookie: qui nessun cookie di sessione.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

// impacted-by: T-1401 (il root admin del bootstrap è APP_ADMIN_EMAIL, non più APP_AUTH_USERNAME)
const BOOTSTRAP_EMAIL = "char-bootstrap@example.test";
const KNOWN_PASSWORD = "char-password-not-real";

function middlewareRequest(path: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) {
    headers.set("cookie", cookie);
  }
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}

function findElement(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement<Record<string, unknown>>(node)) {
    return null;
  }
  if (node.type === type) {
    return node;
  }
  return findElement(node.props.children as ReactNode, type);
}

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_ADMIN_EMAIL", BOOTSTRAP_EMAIL);
  vi.stubEnv("APP_COOKIE_SECURE", "auto");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("APP_SESSION_MAX_AGE_SECONDS", undefined);
  resetEnvForTests();
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvForTests();
});

beforeEach(async () => {
  await resetDatabase();
  // impacted-by: T-1606 (registrazione pubblica aperta solo con il lancio commerciale attivo, D-32)
  await setCommercialLaunchForTests("live");
  // impacted-by: T-1702 (CAPTCHA obbligatorio sulla registrazione aperta: chiavi di prova e siteverify simulato)
  configureTestTurnstile();
});

describe("caratterizzazione: login", () => {
  // covers: AC-104-1
  it("risponde 200 con il cookie di sessione, 401 con password errata e 403 per l'utente sospeso", async () => {
    await createUserWithSession({ displayName: "char-active", password: KNOWN_PASSWORD });
    await createUserWithSession({ displayName: "char-suspended", password: KNOWN_PASSWORD, status: UserStatus.SUSPENDED });

    const ok = await callRoute(login, {
      method: "POST",
      url: "/api/auth/login",
      // impacted-by: T-1401 (accesso con l'email)
      body: { email: "char-active@example.test", password: KNOWN_PASSWORD },
    });
    const setCookie = ok.headers.get("set-cookie") ?? "";

    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ success: true });
    expect(setCookie).toMatch(/^kwb_session=[^;]+;/);
    expect(setCookie).toMatch(/;\s*HttpOnly/i);
    expect(setCookie).toMatch(/;\s*SameSite=lax/i);
    expect(setCookie).toMatch(/;\s*Path=\/(;|$)/);
    expect(setCookie).toMatch(/;\s*Max-Age=604800(;|$)/);
    expect(setCookie).not.toMatch(/;\s*Secure/i);

    const wrong = await callRoute(login, {
      method: "POST",
      url: "/api/auth/login",
      body: { email: "char-active@example.test", password: "password-errata" },
    });
    expect(wrong.status).toBe(401);
    // impacted-by: T-1303 (ogni risposta d'errore ha un code di API_ERROR_CODES)
    expect(await wrong.json()).toEqual({ error: "Credenziali non valide", code: "INVALID_CREDENTIALS" });

    const suspended = await callRoute(login, {
      method: "POST",
      url: "/api/auth/login",
      body: { email: "char-suspended@example.test", password: KNOWN_PASSWORD },
    });
    expect(suspended.status).toBe(403);
    expect(((await suspended.json()) as { error: string }).error.startsWith("Account sospeso")).toBe(true);
  });
});

describe("caratterizzazione: registrazione e logout", () => {
  // covers: AC-104-2
  it("registra creando l'utente di bootstrap, non rivela l'email duplicata e il logout svuota il cookie", async () => {
    expect(await prisma.user.count()).toBe(0);
    // impacted-by: T-1401 (email e nome mostrato al posto dello username)
    // impacted-by: T-1405 (accettazione obbligatoria dei termini correnti)
    const body = {
      email: "char-nuovo@example.test",
      password: KNOWN_PASSWORD,
      confirmPassword: KNOWN_PASSWORD,
      acceptTerms: true,
      termsVersion: LEGAL_TERMS_VERSION,
      // impacted-by: T-1702 (token del CAPTCHA, siteverify simulato)
      turnstileToken: TEST_TURNSTILE_TOKEN,
    };

    const first = await callRoute(register, { method: "POST", url: "/api/auth/register", body });
    // impacted-by: T-1403 (202 CHECK_EMAIL senza cookie di sessione: si accede con email e password)
    expect(first.status).toBe(202);
    expect(first.headers.get("set-cookie")).toBeNull();

    const users = await prisma.user.findMany({ orderBy: { created_at: "asc" } });
    expect(users).toHaveLength(2);
    expect(users.map((user) => [user.email, user.role, user.is_root_admin])).toEqual([
      [BOOTSTRAP_EMAIL, "ADMIN", true],
      ["char-nuovo@example.test", "SUBSCRIBER", false],
    ]);

    const duplicate = await callRoute(register, { method: "POST", url: "/api/auth/register", body });
    // impacted-by: T-503 (aggiornata da T-503: un duplicato non è più un 500)
    // impacted-by: T-1403 (l'email già registrata risponde come una nuova, 202 CHECK_EMAIL, CWE-204)
    expect(duplicate.status).toBe(202);
    expect(await duplicate.json()).toEqual({ code: "CHECK_EMAIL" });
    expect(await prisma.user.count()).toBe(2);

    const out = await callRoute(logout, { method: "POST", url: "/api/auth/logout" });
    const cleared = out.headers.get("set-cookie") ?? "";
    expect(out.status).toBe(200);
    expect(cleared).toMatch(/^kwb_session=;/);
    expect(cleared).toMatch(/;\s*Max-Age=0(;|$)/);
  });
});

describe("caratterizzazione: middleware e sessione", () => {
  // covers: AC-104-3
  it("da anonimo redirige le pagine e rifiuta le API; da autenticato la sessione restituisce l'utente", async () => {
    const page = await middleware(middlewareRequest("/projects"));
    const location = new URL(page.headers.get("location") ?? "");
    expect(page.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/projects");

    const api = await middleware(middlewareRequest("/api/projects"));
    expect(api.status).toBe(401);
    // impacted-by: T-502 (aggiornata da T-502: il 401 del proxy porta code AUTH_REQUIRED e il messaggio italiano)
    // impacted-by: T-602 (il 401 del proxy porta anche il requestId assegnato alla richiesta)
    expect(await api.json()).toEqual({ error: "Sessione non valida o scaduta. Effettua di nuovo il login.", code: "AUTH_REQUIRED", requestId: expect.any(String) });

    // impacted-by: T-1101 (rotta /api/auth/session rimossa: nessun chiamante nell'app)
  });
});

describe("caratterizzazione: difetti noti dell'audit 2026-10-02", () => {
  // covers: AC-104-4
  it("cookie malformato, query persa nel redirect e next non validato", async () => {
    // impacted-by: T-301 (aggiornata da T-301: il cookie malformato vale come sessione assente)
    const malformed = await middleware(middlewareRequest("/projects", "kwb_session=abc.!!!"));
    expect(malformed.status).toBe(307);
    expect(new URL(malformed.headers.get("location") ?? "").pathname).toBe("/login");

    const redirect = await middleware(middlewareRequest("/projects/x/results?view=all"));
    const location = new URL(redirect.headers.get("location") ?? "");
    // impacted-by: T-302 (aggiornata da T-302: next conserva anche la query)
    expect(location.searchParams.get("next")).toBe("/projects/x/results?view=all");

    const element = await LoginPage({ searchParams: Promise.resolve({ next: "//evil.com" }) });
    const form = findElement(element, LoginForm);
    expect(form).not.toBeNull();
    // impacted-by: T-303 (aggiornata da T-303: safeNextPath riporta //evil.com a /)
    expect(form?.props.nextPath).toBe("/");
  });
});
