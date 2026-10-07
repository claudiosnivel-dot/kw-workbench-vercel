// Gate di T-1104 (AC-1104-1…4): nessuna violazione axe serious o critical su login, dashboard e risultati,
// focus della modale di export Sheets, anteprima del tema non salvata ripristinata, titolo dal branding.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { E2E_EMAIL, E2E_USER_PASSWORD } from "./credentials";

async function login(page: Page): Promise<void> {
  const response = await page.request.post("/api/auth/login", {
    data: { email: E2E_EMAIL, password: E2E_USER_PASSWORD },
  });
  expect(response.status()).toBe(200);
}

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

async function saveAppName(page: Page, appName: string): Promise<void> {
  const response = await page.request.patch("/api/settings/branding", { data: { appName } });
  expect(response.status()).toBe(200);
}

test.describe("accessibilità di base", () => {
  // covers: AC-1104-1
  test("login, dashboard e risultati non hanno violazioni axe serious o critical", async ({ page }) => {
    await page.goto("/login");
    expect(await seriousViolations(page), "/login").toEqual([]);

    await login(page);
    await page.goto("/");
    expect(await seriousViolations(page), "dashboard").toEqual([]);

    await page.goto(`/projects/${process.env.E2E_PROJECT_ID}/results`);
    expect(await seriousViolations(page), "risultati").toEqual([]);
  });

  // covers: AC-1104-2
  test("la modale di export Sheets tiene il focus e lo restituisce al pulsante", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${process.env.E2E_PROJECT_ID}/results`);

    const opener = page.getByRole("button", { name: "Esporta su Google Sheets" });
    await opener.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel("Nome file Google Sheets")).toBeFocused();

    for (let press = 0; press < 20; press += 1) {
      await page.keyboard.press("Tab");
      const insideDialog = await page.evaluate(
        () => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false
      );
      expect(insideDialog, `Tab ${press + 1}`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  // covers: AC-1104-3
  test("il tema scelto senza salvare non resta uscendo da /personalizza", async ({ page }) => {
    await login(page);
    await page.goto("/personalizza");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "DARK");

    await page.getByRole("button", { name: "Chiaro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "LIGHT");

    await page.getByRole("link", { name: "Panoramica" }).first().click();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "DARK");
  });

  // covers: AC-1104-4
  test("con appName Acme SEO il titolo di /login contiene Acme SEO", async ({ page }) => {
    await login(page);
    await saveAppName(page, "Acme SEO");
    try {
      await page.context().clearCookies();
      await page.goto("/login");
      expect(await page.title()).toContain("Acme SEO");
    } finally {
      // Nome vuoto: si torna al nome predefinito, con cui si fotografano le baseline visive.
      await login(page);
      await saveAppName(page, "");
    }
  });
});
