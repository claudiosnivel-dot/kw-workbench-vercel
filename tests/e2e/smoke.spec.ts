import { expect, test, type Page } from "@playwright/test";
import { E2E_EMAIL, E2E_USER_PASSWORD } from "./credentials";

async function submitLogin(page: Page, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_EMAIL);
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
  // covers: AC-404-4
  test("dopo il login dell'utente seed la dashboard risponde 200", async ({ page }) => {
    await submitLogin(page, E2E_USER_PASSWORD);
    await page.waitForURL((url) => url.pathname === "/");

    const dashboard = await page.goto("/");
    expect(dashboard?.status()).toBe(200);
    await expect(page.getByRole("button", { name: "Esci" }).first()).toBeVisible();
  });

  // Rimozione di T-901 (AC-901-1): la rotta Google Ads non esiste più, Next risponde 404 a un utente autenticato.
  test("dopo il login la rotta Google Ads rimossa risponde 404", async ({ page }) => {
    await submitLogin(page, E2E_USER_PASSWORD);
    await page.waitForURL((url) => url.pathname === "/");

    const response = await page.request.get("/api/integrations/google-ads");
    expect(response.status()).toBe(404);
  });

  // covers: AC-103-2
  test("con password errata resta su /login e mostra l'errore", async ({ page }) => {
    await submitLogin(page, "password-errata");

    await expect(page.getByText("Credenziali non valide")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/login");
  });
});

test.describe("smoke del proxy", () => {
  // covers: AC-404-2
  test("una richiesta anonima con x-middleware-subrequest su /api/projects riceve 401 (CVE-2025-29927)", async ({
    request,
  }) => {
    const response = await request.get("/api/projects", {
      headers: { "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware" },
    });

    expect(response.status()).toBe(401);
  });

  // covers: AC-404-4
  test("/login con il cookie di sessione malformato risponde 200", async ({ request }) => {
    const response = await request.get("/login", { headers: { cookie: "kwb_session=abc.!!!" } });

    expect(response.status()).toBe(200);
  });
});
