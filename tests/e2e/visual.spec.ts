import { expect, test, type Page } from "@playwright/test";
import { E2E_USER_PASSWORD, E2E_USERNAME } from "./credentials";

// Le baseline sono generate su Linux (CI o container ufficiale Playwright 1.63): altrove il rendering differisce.
test.skip(process.platform !== "linux", "baseline visive generate e confrontate solo su Linux");

async function login(page: Page): Promise<void> {
  const response = await page.request.post("/api/auth/login", {
    data: { username: E2E_USERNAME, password: E2E_USER_PASSWORD },
  });
  expect(response.status()).toBe(200);
}

test.describe("baseline visive", () => {
  // covers: AC-103-3
  test("login", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveScreenshot("login.png", { fullPage: true });
  });

  // covers: AC-103-3
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
  test("risultati", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${process.env.E2E_PROJECT_ID}/results`);
    await expect(page).toHaveScreenshot("results.png", { fullPage: true });
  });
});
