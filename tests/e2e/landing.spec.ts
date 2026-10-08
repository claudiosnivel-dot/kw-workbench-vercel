import { expect, test } from "@playwright/test";
import { E2E_EMAIL, E2E_USER_PASSWORD } from "./credentials";

// Gate di T-1801 (AC-1801-1…3): landing pubblica per lingua, / per l'anonimo e per l'utente autenticato, head SEO.

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
        ["x-default", "/"],
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
  await expect(page.locator("main").getByText("Panoramica", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dalle seed alle keyword pronte da esportare" })).toHaveCount(0);

  const anonymous = await request.get("/projects", { maxRedirects: 0 });
  expect(anonymous.status()).toBe(307);
  const location = new URL(anonymous.headers().location, "http://localhost");
  expect(location.pathname + location.search).toBe("/login?next=%2Fprojects");
});
