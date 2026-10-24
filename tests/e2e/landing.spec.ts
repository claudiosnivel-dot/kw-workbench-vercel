import { expect, test } from "@playwright/test";
import { MESSAGES } from "@/lib/i18n/catalogs";
import { E2E_EMAIL, E2E_USER_PASSWORD } from "./credentials";

// Gate di T-1801 (AC-1801-1…3): landing pubblica per lingua, / per l'anonimo e per l'utente autenticato, head SEO.
// Gate di T-5801 (AC-5801-3): title e description della pagina principale nelle quattro lingue, con i suoi link.

test.describe("landing pubblica per l'anonimo con il browser in inglese", () => {
  test.use({ locale: "en-US" });

  // covers: AC-1801-1
  test("/ porta a /en; /it e /en rispondono 200 con la lingua del percorso, la registrazione e nessun link dell'app", async ({
    page,
    request,
  }) => {
    const root = await request.get("/", { maxRedirects: 0, headers: { "accept-language": "en-US,en;q=0.9" } });
    expect(root.status()).toBe(307);
    expect(new URL(root.headers().location, "http://localhost").pathname).toBe("/en");

    for (const [path, lang] of [
      ["/it", "it"],
      ["/en", "en"],
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      expect(new URL(page.url()).pathname).toBe(path);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      expect(await page.locator('a[href="/register"]').count(), path).toBeGreaterThan(0);
      expect(await page.locator('a[href^="/projects"]').count(), path).toBe(0);
    }
  });

  // covers: AC-1801-3
  test("il head di /en ha hreflang it, en e x-default, canonical /en e Open Graph in en_US", async ({ page }) => {
    await page.goto("/en");

    const alternates = await page
      .locator('link[rel="alternate"][hreflang]')
      .evaluateAll((links) => links.map((link) => [link.getAttribute("hreflang"), new URL(link.getAttribute("href") ?? "", location.href).pathname]));
    expect(alternates).toEqual(
      expect.arrayContaining([
        ["it", "/it"],
        ["en", "/en"],
        // impacted-by: T-4902 (AC-1801-3 emendato: x-default verso la versione inglese, con es-ES ed es-419)
        ["es-ES", "/es"],
        ["es-419", "/es-419"],
        ["x-default", "/en"],
      ])
    );
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(new URL(canonical ?? "", page.url()).pathname).toBe("/en");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "en_US");
  });

  test("sitemap.xml e robots.txt rispondono 200 senza sessione", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml", { maxRedirects: 0 });
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain("/en</loc>");

    const robots = await request.get("/robots.txt", { maxRedirects: 0 });
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain("Disallow: /api/");
  });
});

// covers: AC-1801-2
test("l'utente autenticato su / vede la dashboard; l'anonimo su /projects va al login", async ({ page, request }) => {
  const login = await page.request.post("/api/auth/login", { data: { email: E2E_EMAIL, password: E2E_USER_PASSWORD } });
  expect(login.status()).toBe(200);

  await page.goto("/");
  expect(new URL(page.url()).pathname).toBe("/");
  // impacted-by: T-2305 (AC-1801-2 emendato: la home dell'app ha l'intestazione «I tuoi progetti», non più Panoramica)
  await expect(page.getByRole("heading", { name: "I tuoi progetti" })).toBeVisible();
  // impacted-by: T-5801 (AC-1801-2 emendato: la landing ha il nuovo H1 sul percorso completo)
  await expect(page.getByRole("heading", { level: 1, name: MESSAGES.it.marketing.landing.title })).toHaveCount(0);

  const anonymous = await request.get("/projects", { maxRedirects: 0 });
  expect(anonymous.status()).toBe(307);
  const location = new URL(anonymous.headers().location, "http://localhost");
  expect(location.pathname + location.search).toBe("/login?next=%2Fprojects");
});

// Testi di marketing.meta.home per lingua dai cataloghi a livelli dell'app (es-419 eredita da es-ES le chiavi che non ridefinisce).
const HOME_PAGES = [
  { path: "/it", pricing: "/it/pricing", meta: MESSAGES.it.marketing.meta.home },
  { path: "/en", pricing: "/en/pricing", meta: MESSAGES.en.marketing.meta.home },
  { path: "/es", pricing: "/es/pricing", meta: MESSAGES["es-ES"].marketing.meta.home },
  { path: "/es-419", pricing: "/es-419/pricing", meta: MESSAGES["es-419"].marketing.meta.home },
];

// covers: AC-5801-3
test("/it, /en, /es e /es-419 hanno title e description della lingua, i link a registrazione, prezzi e accesso e nessun link dell'app", async ({
  page,
}) => {
  for (const { path, pricing, meta } of HOME_PAGES) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);

    expect(await page.title(), path).toBe(`${meta.title} · Titan SEO`);
    await expect(page.locator('meta[name="description"]'), path).toHaveAttribute("content", meta.description);

    const main = page.locator("main");
    expect(await main.locator('a[href="/register"]').count(), path).toBeGreaterThan(0);
    expect(await main.locator(`a[href="${pricing}"]`).count(), path).toBeGreaterThan(0);
    expect(await main.locator('a[href="/login"]').count(), path).toBeGreaterThan(0);
    expect(await page.locator('a[href^="/projects"]').count(), path).toBe(0);
  }
});
