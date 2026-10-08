// T-1801 (D-16, D-28 emendata): percorsi pubblici esatti delle pagine marketing, lingua del percorso passata dal proxy e
// redirect dell'anonimo da / alla landing nella lingua del browser. Complemento del gate E2E tests/e2e/landing.spec.ts.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_LOCALE_HEADER } from "@/lib/i18n/locale";
import { MARKETING_ROUTES } from "@/lib/marketing/routes";
import { proxy } from "@/proxy";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

function request(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}

// Header della richiesta inoltrata da NextResponse.next({ request: { headers } }).
function forwardedHeader(response: Response, name: string): string | null {
  return response.headers.get(`x-middleware-request-${name}`);
}

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("redirect di / per l'anonimo", () => {
  it("segue il cookie della lingua, poi Accept-Language, con default it", async () => {
    const english = await proxy(request("/", { "accept-language": "en-US,en;q=0.9" }));
    expect(english.status).toBe(307);
    expect(new URL(english.headers.get("location") ?? "").pathname).toBe("/en");

    const fallback = await proxy(request("/", { "accept-language": "de-DE" }));
    expect(new URL(fallback.headers.get("location") ?? "").pathname).toBe("/it");

    const cookie = await proxy(request("/", { "accept-language": "en-US", cookie: "kwb_locale=it" }));
    expect(new URL(cookie.headers.get("location") ?? "").pathname).toBe("/it");
  });

  it("l'utente autenticato su / passa alla dashboard", async () => {
    const user = await createUserWithSession({ displayName: "t1801-proxy" });
    const response = await proxy(request("/", { cookie: user.cookie, "accept-language": "en-US" }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("pagine marketing", () => {
  it("ogni percorso dell'elenco passa senza sessione con la lingua del percorso nella richiesta inoltrata", async () => {
    for (const route of MARKETING_ROUTES) {
      const response = await proxy(request(route.path, { [PAGE_LOCALE_HEADER]: route.locale === "it" ? "en" : "it" }));
      expect(response.headers.get("x-middleware-next"), route.path).toBe("1");
      expect(forwardedHeader(response, PAGE_LOCALE_HEADER), route.path).toBe(route.locale);
    }
  });

  it("nessun prefisso diventa pubblico e la lingua inviata dal client non arriva alle altre pagine", async () => {
    for (const path of ["/en/projects", "/it/admin", "/en/", "/it/pricing/x"]) {
      const response = await proxy(request(path));
      expect(response.status, path).toBe(307);
      expect(new URL(response.headers.get("location") ?? "").pathname, path).toBe("/login");
    }

    const user = await createUserWithSession({ displayName: "t1801-header" });
    const dashboard = await proxy(request("/projects", { cookie: user.cookie, [PAGE_LOCALE_HEADER]: "en" }));
    expect(dashboard.headers.get("x-middleware-next")).toBe("1");
    expect(forwardedHeader(dashboard, PAGE_LOCALE_HEADER)).toBeNull();
  });

  it("le immagini Open Graph di public/og passano senza sessione, gli altri file annidati no", async () => {
    const image = await proxy(request("/og/site.png"));
    expect(image.headers.get("x-middleware-next")).toBe("1");

    const other = await proxy(request("/og/site.svg"));
    expect(other.status).toBe(307);
  });
});
