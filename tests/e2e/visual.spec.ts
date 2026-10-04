import { expect, test, type Page } from "@playwright/test";
import { E2E_USER_PASSWORD, E2E_USERNAME } from "./credentials";

async function login(page: Page): Promise<void> {
  const response = await page.request.post("/api/auth/login", {
    data: { username: E2E_USERNAME, password: E2E_USER_PASSWORD },
  });
  expect(response.status()).toBe(200);
}

test.describe("baseline visive", () => {
  // Le baseline sono generate su Linux (CI o container ufficiale Playwright 1.63): altrove il rendering differisce.
  test.skip(process.platform !== "linux", "baseline visive generate e confrontate solo su Linux");

  // covers: AC-103-3
  // covers: AC-405-1
  test("login", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveScreenshot("login.png", { fullPage: true });
  });

  // covers: AC-103-3
  // covers: AC-405-1
  test("dashboard", async ({ page }) => {
    await login(page);
    await page.goto("/");
    await expect(page).toHaveScreenshot("dashboard.png", {
      fullPage: true,
      // Date dei progetti e dei job.
      mask: [page.locator("td").filter({ hasText: /\d{1,2}\/\d{1,2}\/\d{2,4}/ })],
    });
  });

  // covers: AC-103-3
  // covers: AC-405-1
  test("risultati", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${process.env.E2E_PROJECT_ID}/results`);
    await expect(page).toHaveScreenshot("results.png", { fullPage: true });
  });
});

// Valori calcolati sulla build con Tailwind 3.4 (tema scuro predefinito), prima della migrazione a v4:
// in v4 il colore predefinito del bordo passa da gray-200 a currentColor. Su /login nessun elemento usa la
// classe border senza colore (le 39 stringhe con border dichiarano anche il colore): i bordi della pagina
// vengono da .card, .input e .top-nav-logo in app/globals.css, ed è su questi che si misura il cambio.
const V3_BORDER_COLORS = {
  ".card": "rgba(100, 116, 139, 0.42)",
  ".input": "rgba(100, 116, 139, 0.42)",
  ".top-nav-logo": "rgba(255, 255, 255, 0.16)",
};

test.describe("bordi dopo Tailwind 4", () => {
  // covers: AC-405-3
  test("su /login il colore del bordo coincide con quello della baseline v3 e non con il colore del testo", async ({
    page,
  }) => {
    await page.goto("/login");

    for (const [selector, v3Color] of Object.entries(V3_BORDER_COLORS)) {
      const style = await page
        .locator(selector)
        .first()
        .evaluate((element) => {
          const computed = getComputedStyle(element);
          return { border: computed.borderTopColor, text: computed.color, width: computed.borderTopWidth };
        });

      expect(style.width, selector).toBe("1px");
      expect(style.border, selector).toBe(v3Color);
      expect(style.border, selector).not.toBe(style.text);
    }
  });
});
