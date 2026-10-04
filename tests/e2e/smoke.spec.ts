import { expect, test, type Page } from "@playwright/test";
import { E2E_USER_PASSWORD, E2E_USERNAME } from "./credentials";

async function submitLogin(page: Page, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(E2E_USERNAME);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Accedi" }).click();
}

test.describe("smoke di login", () => {
  // covers: AC-103-1
  test("con credenziali valide porta alla dashboard con il cookie di sessione", async ({ page, context }) => {
    await submitLogin(page, E2E_USER_PASSWORD);

    await page.waitForURL((url) => url.pathname === "/");
    expect(new URL(page.url()).pathname).toBe("/");
    expect((await context.cookies()).map((cookie) => cookie.name)).toContain("kwb_session");
    await expect(page.getByRole("button", { name: "Esci" }).first()).toBeVisible();
  });

  // covers: AC-401-4
  test("dopo il login dell'utente seed la dashboard risponde 200", async ({ page }) => {
    await submitLogin(page, E2E_USER_PASSWORD);
    await page.waitForURL((url) => url.pathname === "/");

    const dashboard = await page.goto("/");
    expect(dashboard?.status()).toBe(200);
    await expect(page.getByRole("button", { name: "Esci" }).first()).toBeVisible();
  });

  // covers: AC-103-2
  test("con password errata resta su /login e mostra l'errore", async ({ page }) => {
    await submitLogin(page, "password-errata");

    await expect(page.getByText("Credenziali non valide")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/login");
  });
});
