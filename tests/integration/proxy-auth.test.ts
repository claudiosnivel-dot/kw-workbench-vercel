// Gate di T-301 (AC-301-3, AC-301-4): un cookie di sessione malformato equivale a nessuna sessione.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getOptionalAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { middleware } from "@/middleware";

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
    const loginPage = await middleware(middlewareRequest("/login", MALFORMED_COOKIE));
    expect(loginPage.headers.get("x-middleware-next")).toBe("1");
    expect(loginPage.headers.get("location")).toBeNull();

    const page = await middleware(middlewareRequest("/projects", MALFORMED_COOKIE));
    const location = new URL(page.headers.get("location") ?? "");
    expect(page.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/projects");

    const api = await middleware(middlewareRequest("/api/projects", MALFORMED_COOKIE));
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: "Unauthorized" });
  });
});

describe("layout con cookie di sessione malformato", () => {
  // covers: AC-301-4
  it("getOptionalAuthenticatedUserFromCookies si risolve con null", async () => {
    await expect(getOptionalAuthenticatedUserFromCookies()).resolves.toBeNull();
  });
});
