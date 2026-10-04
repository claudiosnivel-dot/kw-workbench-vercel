// Gate di T-301 (AC-301-3, AC-301-4): un cookie di sessione malformato equivale a nessuna sessione.
// Gate di T-404 (AC-404-1): con Next 16 il middleware è proxy.ts con la funzione proxy.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getOptionalAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { proxy } from "@/proxy";

const MALFORMED_COOKIE = "kwb_session=abc.!!!";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "kwb_session" ? { name, value: "abc.!!!" } : undefined),
  }),
}));

function middlewareRequest(path: string, cookie: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers: new Headers({ cookie }) });
}

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("middleware con cookie di sessione malformato", () => {
  // covers: AC-301-3
  it("lascia passare /login, redirige /projects al login e risponde 401 su /api/projects", async () => {
    const loginPage = await proxy(middlewareRequest("/login", MALFORMED_COOKIE));
    expect(loginPage.headers.get("x-middleware-next")).toBe("1");
    expect(loginPage.headers.get("location")).toBeNull();

    const page = await proxy(middlewareRequest("/projects", MALFORMED_COOKIE));
    const location = new URL(page.headers.get("location") ?? "");
    expect(page.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/projects");

    const api = await proxy(middlewareRequest("/api/projects", MALFORMED_COOKIE));
    expect(api.status).toBe(401);
    // impacted-by: T-502 (il 401 del proxy usa la risposta condivisa con code AUTH_REQUIRED)
    // impacted-by: T-602 (il 401 del proxy porta anche il requestId assegnato alla richiesta)
    expect(await api.json()).toEqual({ error: "Sessione non valida o scaduta. Effettua di nuovo il login.", code: "AUTH_REQUIRED", requestId: expect.any(String) });
  });
});

describe("proxy senza sessione (Next 16)", () => {
  // covers: AC-404-1
  it("risponde 401 JSON su /api/projects, redirige /projects/abc?tab=x al login e middleware.ts non esiste", async () => {
    const api = await proxy(new NextRequest(new URL("/api/projects", "http://localhost:3000")));
    expect(api.status).toBe(401);
    // impacted-by: T-502 (il 401 del proxy usa la risposta condivisa con code AUTH_REQUIRED)
    // impacted-by: T-602 (il 401 del proxy porta anche il requestId assegnato alla richiesta)
    expect(await api.json()).toEqual({ error: "Sessione non valida o scaduta. Effettua di nuovo il login.", code: "AUTH_REQUIRED", requestId: expect.any(String) });

    const page = await proxy(new NextRequest(new URL("/projects/abc?tab=x", "http://localhost:3000")));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fprojects%2Fabc%3Ftab%3Dx");

    expect(existsSync(join(process.cwd(), "middleware.ts"))).toBe(false);
  });
});

describe("layout con cookie di sessione malformato", () => {
  // covers: AC-301-4
  it("getOptionalAuthenticatedUserFromCookies si risolve con null", async () => {
    await expect(getOptionalAuthenticatedUserFromCookies()).resolves.toBeNull();
  });
});
