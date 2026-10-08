// Gate di T-1801 (AC-1801-4): sitemap e robots dalle pagine pubbliche, serviti senza sessione attraverso il proxy.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { proxy } from "@/proxy";

beforeEach(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_PUBLIC_URL", "https://example.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sitemap.xml e robots.txt", () => {
  // covers: AC-1801-4
  it("la sitemap elenca le landing per lingua e robots esclude le aree dell'app con la sitemap assoluta", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain("https://example.test/it");
    expect(urls).toContain("https://example.test/en");

    const landing = sitemap().find((entry) => entry.url === "https://example.test/en");
    expect(landing?.alternates?.languages).toEqual({ en: "https://example.test/en", it: "https://example.test/it" });

    const rules = robots();
    const disallow = [rules.rules].flat().flatMap((rule) => [rule.disallow ?? []].flat());
    expect(disallow).toContain("/api/");
    expect(disallow).toContain("/projects");
    expect(rules.sitemap).toBe("https://example.test/sitemap.xml");
  });

  // covers: AC-1801-4
  it("le richieste anonime di /sitemap.xml e /robots.txt passano il proxy senza redirect", async () => {
    for (const path of ["/sitemap.xml", "/robots.txt"]) {
      const response = await proxy(new NextRequest(new URL(path, "https://example.test")));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("location")).toBeNull();
    }
  });
});
