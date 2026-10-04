// Caratterizzazione di T-104: fotografa login, registrazione, logout, sessione e middleware
// così come sono oggi, difetti noti compresi. Le asserzioni marcate impacted-by cambiano
// solo con il task indicato e passando da gate umano.
import { UserStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as session } from "@/app/api/auth/session/route";
import LoginPage from "@/app/login/page";
import { LoginForm } from "@/components/login-form";
import { prisma } from "@/lib/prisma";
import { middleware } from "@/middleware";
import { createUserWithSession } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { callRoute } from "../../helpers/http";

// Da T-302 la pagina di login legge l'utente dai cookie: qui nessun cookie di sessione.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const BOOTSTRAP_USERNAME = "char-bootstrap";
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
  vi.stubEnv("APP_AUTH_USERNAME", BOOTSTRAP_USERNAME);
  vi.stubEnv("APP_AUTH_PASSWORD", "char-bootstrap-password-not-real");
  vi.stubEnv("APP_COOKIE_SECURE", "auto");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("APP_SESSION_MAX_AGE_SECONDS", undefined);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("caratterizzazione: login", () => {
  // covers: AC-104-1
  it("risponde 200 con il cookie di sessione, 401 con password errata e 403 per l'utente sospeso", async () => {
    await createUserWithSession({ username: "char-active", password: KNOWN_PASSWORD });
    await createUserWithSession({ username: "char-suspended", password: KNOWN_PASSWORD, status: UserStatus.SUSPENDED });

    const ok = await callRoute(login, {
      method: "POST",
      url: "/api/auth/login",
      body: { username: "char-active", password: KNOWN_PASSWORD },
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
      body: { username: "char-active", password: "password-errata" },
    });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: "Credenziali non valide" });

    const suspended = await callRoute(login, {
      method: "POST",
      url: "/api/auth/login",
      body: { username: "char-suspended", password: KNOWN_PASSWORD },
    });
    expect(suspended.status).toBe(403);
    expect(((await suspended.json()) as { error: string }).error.startsWith("Account sospeso")).toBe(true);
  });
});

describe("caratterizzazione: registrazione e logout", () => {
  // covers: AC-104-2
  it("registra creando l'utente di bootstrap, rifiuta lo username duplicato e il logout svuota il cookie", async () => {
    expect(await prisma.user.count()).toBe(0);
    const body = { username: "char-nuovo", password: KNOWN_PASSWORD, confirmPassword: KNOWN_PASSWORD };

    const first = await callRoute(register, { method: "POST", url: "/api/auth/register", body });
    expect(first.status).toBe(200);
    expect(first.headers.get("set-cookie") ?? "").toMatch(/^kwb_session=[^;]+;/);

    const users = await prisma.user.findMany({ orderBy: { created_at: "asc" } });
    expect(users).toHaveLength(2);
    expect(users.map((user) => [user.username, user.role, user.is_root_admin])).toEqual([
      [BOOTSTRAP_USERNAME, "ADMIN", true],
      ["char-nuovo", "SUBSCRIBER", false],
    ]);

    const duplicate = await callRoute(register, { method: "POST", url: "/api/auth/register", body });
    expect(duplicate.status).toBe(400);
    expect(await duplicate.json()).toEqual({ error: "Username gia in uso" });

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
    expect(await api.json()).toEqual({ error: "Unauthorized" });

    const anonymous = await callRoute(session, { url: "/api/auth/session" });
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ authenticated: false, authEnabled: true });

    const { user, cookie } = await createUserWithSession({ username: "char-session" });
    const authenticated = await callRoute(session, { url: "/api/auth/session", cookie });
    expect(authenticated.status).toBe(200);
    expect(((await authenticated.json()) as { userId: string }).userId).toBe(user.id);
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
    // impacted-by: T-303
    expect(form?.props.nextPath).toBe("//evil.com");
  });
});
