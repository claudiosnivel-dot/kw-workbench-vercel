import { expect, test, type Page } from "@playwright/test";
import { E2E_EMAIL, E2E_USER_PASSWORD } from "./credentials";

// Gate di T-1803 (AC-1803-1…3): pagine legali pubbliche per lingua, versione dei termini, footer senza banner cookie.

const LEGAL_PAGES = ["privacy", "terms", "cookies"] as const;

/** href dei link del footer verso le pagine legali. */
async function footerLegalLinks(page: Page): Promise<string[]> {
  return page
    .locator("footer a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? "").filter((href) => /\/(privacy|terms|cookies)$/.test(href)));
}

// covers: AC-1803-1
test("le 6 pagine legali rispondono 200 all'anonimo con un h1 e la lingua del percorso", async ({ page }) => {
  for (const lang of ["it", "en"]) {
    for (const doc of LEGAL_PAGES) {
      const path = `/${lang}/${doc}`;
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      expect(new URL(page.url()).pathname).toBe(path);
      await expect(page.locator("h1"), path).toHaveCount(1);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
    }
  }
});

// covers: AC-1803-2
test("la pagina dei termini mostra la versione accettata con il consenso", async ({ page }) => {
  await page.goto("/it/terms");
  await expect(page.getByTestId("terms-version")).toHaveText("Versione segnaposto-2026-10-07");
});

// covers: AC-1803-3
test("il footer di landing, login e dashboard porta alle pagine legali della lingua, senza banner cookie", async ({ page }) => {
  await page.goto("/it");
  expect(await footerLegalLinks(page)).toEqual(["/it/privacy", "/it/terms", "/it/cookies"]);
  await expect(page.getByTestId("cookie-banner")).toHaveCount(0);

  await page.goto("/en");
  expect(await footerLegalLinks(page)).toEqual(["/en/privacy", "/en/terms", "/en/cookies"]);

  await page.goto("/login");
  expect(await footerLegalLinks(page)).toEqual(["/it/privacy", "/it/terms", "/it/cookies"]);
  await expect(page.getByTestId("cookie-banner")).toHaveCount(0);

  const login = await page.request.post("/api/auth/login", { data: { email: E2E_EMAIL, password: E2E_USER_PASSWORD } });
  expect(login.status()).toBe(200);
  await page.goto("/");
  expect(new URL(page.url()).pathname).toBe("/");
  expect(await footerLegalLinks(page)).toEqual(["/it/privacy", "/it/terms", "/it/cookies"]);
  await expect(page.getByTestId("cookie-banner")).toHaveCount(0);
});
