// Gate di T-2602 (AC-2602-1): le impostazioni del progetto si aprono con le Avanzate chiuse; «Elimina il progetto»
// compare solo a chi ha project.delete (ADMIN e OWNER, D-08), non al MEMBER.
import { randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createE2EUser } from "./credentials";

// Utenti dedicati: il progetto di questo file non compare nelle pagine fotografate dall'utente seed.
// Password generata a ogni esecuzione, mai una credenziale reale.
const PASSWORD = randomBytes(18).toString("hex");
const OWNER_EMAIL = "e2e-settings-owner@example.test";
const MEMBER_EMAIL = "e2e-settings-member@example.test";
const ADMIN_EMAIL = "e2e-settings-admin@example.test";
const EMAILS = [OWNER_EMAIL, MEMBER_EMAIL, ADMIN_EMAIL];
const ids = { project: "", users: [] as string[] };

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  const [owner, member, admin] = await Promise.all(EMAILS.map((email) => createE2EUser(email, PASSWORD)));
  ids.users.push(owner.id, member.id, admin.id);
  await prisma.membership.createMany({
    data: [
      { workspace_id: owner.workspaceId, user_id: member.id, role: "MEMBER" },
      { workspace_id: owner.workspaceId, user_id: admin.id, role: "ADMIN" },
    ],
  });
  const project = await prisma.project.create({
    data: { name: "Negozio scarpe running", workspace_id: owner.workspaceId, created_by_user_id: owner.id, language_code: "it", country_code: "IT" },
  });
  ids.project = project.id;
  await prisma.subproject.create({ data: { project_id: project.id, name: "Scarpe running", position: 0 } });
});

test.afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: ids.project } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.$disconnect();
});

async function openSettings(page: Page, email: string): Promise<void> {
  const login = await page.request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(login.status()).toBe(200);
  await page.goto(`/projects/${ids.project}/settings`);
  await expect(page.getByRole("heading", { level: 1, name: "Impostazioni" })).toBeVisible();
}

test.describe("impostazioni del progetto", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  // covers: AC-2602-1
  test("MEMBER e ADMIN vedono le Avanzate chiuse; solo l'ADMIN vede Elimina il progetto", async ({ browser }) => {
    for (const [email, canDelete] of [
      [MEMBER_EMAIL, false],
      [ADMIN_EMAIL, true],
    ] as const) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await openSettings(page, email);

      await expect(page.locator("details", { hasText: "Avanzate" })).not.toHaveAttribute("open", /.*/);
      await expect(page.getByLabel("Volume minimo")).toBeHidden();
      await expect(page.getByLabel("Profilo del punteggio")).toBeHidden();
      await expect(page.getByRole("button", { name: "Elimina il progetto" })).toHaveCount(canDelete ? 1 : 0);
      await context.close();
    }
  });
});
