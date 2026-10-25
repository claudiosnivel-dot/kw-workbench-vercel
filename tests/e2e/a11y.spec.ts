// Gate di T-1104 (AC-1104-1…4): nessuna violazione axe serious o critical su login, dashboard e risultati,
// focus della modale di export Sheets, tema scelto nelle preferenze che resta tornando alla home, titolo dal branding.
// impacted-by: T-2403, T-2406 (i risultati sono la pagina delle keyword e gli export partono dalla finestra Esporta della
// barra in alto: AC-1104-1 e AC-1104-2 emendati)
// impacted-by: T-2803 (Personalizza è la sezione Preferenze dell'account: AC-1104-3 apre /account/preferences)
// impacted-by: T-2901 (le preferenze si salvano a ogni scelta: AC-1104-3 emendato, il tema Chiaro resta tornando alla home
// e il test usa un utente dedicato)
// Gate di T-5802 (AC-5802-3): la pagina principale con le scene, senza sessione, nel tema chiaro e nello scuro del dispositivo.
import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createE2EUser, E2E_EMAIL, E2E_USER_PASSWORD } from "./credentials";

// Utente dedicato al tema (AC-1104-3): le pagine fotografate dall'utente seed restano scure. Password generata a ogni
// esecuzione, mai una credenziale reale.
const THEME_EMAIL = "e2e-theme@example.test";
const THEME_PASSWORD = randomBytes(18).toString("hex");

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: THEME_EMAIL } });
  await createE2EUser(THEME_EMAIL, THEME_PASSWORD);
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: THEME_EMAIL } });
  await prisma.$disconnect();
});

async function login(page: Page, email = E2E_EMAIL, password = E2E_USER_PASSWORD): Promise<void> {
  const response = await page.request.post("/api/auth/login", { data: { email, password } });
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

    await page.goto(`/projects/${process.env.E2E_PROJECT_ID}`);
    await page.waitForURL((url) => url.pathname.includes("/keywords/"));
    expect(await seriousViolations(page), "risultati").toEqual([]);
  });

  // covers: AC-1104-2
  test("la finestra Esporta tiene il focus e lo restituisce al pulsante", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${process.env.E2E_PROJECT_ID}`);
    await page.waitForURL((url) => url.pathname.includes("/keywords/"));

    const opener = page.getByRole("button", { name: "Esporta", exact: true });
    await opener.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false)).toBe(true);

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
  test("il tema Chiaro scelto nelle preferenze dell'account resta tornando alla home", async ({ page }) => {
    await login(page, THEME_EMAIL, THEME_PASSWORD);
    try {
      await page.goto("/account/preferences");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "DARK");

      await page.getByRole("button", { name: "Chiaro" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Salvato" })).toBeVisible();

      // impacted-by: T-2304 (la barra non ha più la voce Panoramica: alla home porta il marchio)
      await page.getByRole("link", { name: "Titan SEO" }).first().click();
      await page.waitForURL((url) => url.pathname === "/");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "LIGHT");
    } finally {
      // Il tema torna DARK anche se un passo fallisce.
      const response = await page.request.patch("/api/user/preferences", { data: { themeMode: "DARK" } });
      expect(response.status()).toBe(200);
    }
  });

  // covers: AC-5802-3
  test("/it e /es senza sessione non hanno violazioni axe serious o critical con il dispositivo chiaro e con lo scuro", async ({
    page,
  }) => {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      for (const path of ["/it", "/es"]) {
        await page.goto(path);
        await expect(page.locator("html"), path).toHaveAttribute("data-theme", "SYSTEM");
        expect(await seriousViolations(page), `${path} ${colorScheme}`).toEqual([]);
      }
    }
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
