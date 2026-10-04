import { expect, test } from "@playwright/test";
import { E2E_USER_PASSWORD, E2E_USERNAME } from "./credentials";

test.describe("smoke di login", () => {
  // covers: AC-103-1
  test("con credenziali valide porta alla dashboard con il cookie di sessione", async ({ page, context }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(E2E_USERNAME);
    await page.getByLabel("Password").fill(E2E_USER_PASSWORD);
    await page.getByRole("button", { name: "Accedi" }).click();

    await page.waitForURL((url) => url.pathname === "/");
    expect(new URL(page.url()).pathname).toBe("/");
    expect((await context.cookies()).map((cookie) => cookie.name)).toContain("kwb_session");
    await expect(page.getByRole("button", { name: "Esci" }).first()).toBeVisible();
  });

  // covers: AC-103-2
  test("con password errata resta su /login e mostra l'errore", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(E2E_USERNAME);
    await page.getByLabel("Password").fill("password-errata");
    await page.getByRole("button", { name: "Accedi" }).click();

    await expect(page.getByText("Credenziali non valide")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/login");
  });
});
