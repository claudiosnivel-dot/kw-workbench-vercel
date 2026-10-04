// Gate di T-302 (AC-302-1…AC-302-4): file pubblici senza login, query conservata nel redirect,
// /login e /register rimandano a / solo l'utente esistente e ACTIVE.
import { UserStatus } from "@/lib/generated/prisma/enums";
import { NextRequest } from "next/server";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";
import RegisterPage from "@/app/register/page";
import { LoginForm } from "@/components/login-form";
import { RegisterForm } from "@/components/register-form";
import { proxy } from "@/proxy";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const cookieJar = vi.hoisted(() => ({ session: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "kwb_session" && cookieJar.session !== undefined ? { name, value: cookieJar.session } : undefined,
  }),
}));

function middlewareRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"));
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

function sessionValue(cookie: string): string {
  return cookie.slice(cookie.indexOf("=") + 1);
}

/** Destinazione di un errore NEXT_REDIRECT (digest NEXT_REDIRECT;tipo;url;status;). */
function redirectTarget(error: unknown): string | null {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;") ? digest.split(";")[2] : null;
}

async function pageError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return null;
}

const searchParams = () => Promise.resolve({});

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_PUBLIC_SIGNUP_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  cookieJar.session = undefined;
  await resetDatabase();
});

describe("middleware: file pubblici", () => {
  // covers: AC-302-1
  it("lascia passare /.well-known/* e i file di un solo segmento con estensione ammessa", async () => {
    for (const path of ["/.well-known/bastione-ownership.txt", "/.well-known/security.txt", "/robots.txt"]) {
      const response = await proxy(middlewareRequest(path));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("location")).toBeNull();
    }
  });

  // covers: AC-302-2
  it("le API restano autenticate anche con un'estensione e i percorsi con più segmenti restano protetti", async () => {
    for (const path of ["/api/projects.json", "/api/projects"]) {
      const response = await proxy(middlewareRequest(path));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    }

    const nested = await proxy(middlewareRequest("/projects/abc.png"));
    expect(nested.status).toBe(307);
    expect(new URL(nested.headers.get("location") ?? "").pathname).toBe("/login");
  });
});

describe("middleware: redirect al login", () => {
  // covers: AC-302-3
  it("next conserva percorso e query della richiesta", async () => {
    const response = await proxy(middlewareRequest("/projects/abc/results?view=all&page=2"));
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/projects/abc/results?view=all&page=2");
  });
});

describe("/login e /register con un utente già autenticato", () => {
  // covers: AC-302-4
  it("rimandano a / l'utente ACTIVE e mostrano i form all'utente SUSPENDED con token valido", async () => {
    const active = await createUserWithSession({ username: "t302-active" });
    cookieJar.session = sessionValue(active.cookie);

    const loginError = await pageError(() => LoginPage({ searchParams: searchParams() }));
    const registerError = await pageError(() => RegisterPage({ searchParams: searchParams() }));
    expect((loginError as Error | null)?.message).toBe("NEXT_REDIRECT");
    expect(redirectTarget(loginError)).toBe("/");
    expect((registerError as Error | null)?.message).toBe("NEXT_REDIRECT");
    expect(redirectTarget(registerError)).toBe("/");

    const suspended = await createUserWithSession({ username: "t302-suspended", status: UserStatus.SUSPENDED });
    cookieJar.session = sessionValue(suspended.cookie);

    const loginElement = await LoginPage({ searchParams: searchParams() });
    const registerElement = await RegisterPage({ searchParams: searchParams() });
    expect(findElement(loginElement, LoginForm)).not.toBeNull();
    expect(findElement(registerElement, RegisterForm)).not.toBeNull();
  });
});
