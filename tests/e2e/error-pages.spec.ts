// Gate di T-502 (AC-502-4, AC-502-5): sessione terminata e pagina inesistente senza «Application error».
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createE2EUser, E2E_EMAIL, E2E_USER_PASSWORD } from "./credentials";

const SUSPENDED_EMAIL = "e2e-sospeso@example.test";

async function submitLogin(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_USER_PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

test.describe("pagine di errore", () => {
  // covers: AC-502-4
  test("un utente sospeso durante la sessione torna al login con il messaggio e senza cookie", async ({
    page,
    context,
  }) => {
    await prisma.user.deleteMany({ where: { email: SUSPENDED_EMAIL } });
    const user = await createE2EUser(SUSPENDED_EMAIL, E2E_USER_PASSWORD);
    await prisma.userOnboardingProgress.create({
      data: { user_id: user.id, status: "COMPLETED", current_step: "REVIEW_EXPORT", completed_at: new Date() },
    });

    await submitLogin(page, SUSPENDED_EMAIL);
    await prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });

    const statuses: number[] = [];
    page.on("response", (response) => statuses.push(response.status()));
    await page.reload();
    await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("reason") === "session_ended");

    await expect(page.getByText("La sessione è terminata. Accedi di nuovo.")).toBeVisible();
    expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain("kwb_session");
    expect(statuses.filter((status) => status >= 500)).toEqual([]);
  });

  // covers: AC-502-5
  test("un progetto inesistente risponde 404 con la pagina «Pagina non trovata»", async ({ page }) => {
    await submitLogin(page, E2E_EMAIL);

    const response = await page.goto("/projects/id-inesistente");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Pagina non trovata" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Torna alla dashboard" })).toHaveAttribute("href", "/");
    await expect(page.getByText("Application error")).toHaveCount(0);
  });
});
