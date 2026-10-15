// Gate di T-3101 (AC-3101-1, AC-3101-2) e T-3102 (AC-3102-1): area «Workspace» con Generale, Membri e Piano, controlli
// per ruolo e «Azioni irreversibili»; il vecchio indirizzo /billing porta alla sezione Piano.
import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createE2EUser } from "./credentials";

// Utenti dedicati: il workspace di squadra non compare nelle pagine fotografate dall'utente seed. Password generata a
// ogni esecuzione, mai una credenziale reale.
const PASSWORD = randomBytes(18).toString("hex");
const OWNER_EMAIL = "e2e-wss-owner@example.test";
const ADMIN_EMAIL = "e2e-wss-admin@example.test";
const MEMBER_EMAIL = "e2e-wss-member@example.test";
const SOLO_EMAIL = "e2e-wss-solo@example.test";
const EMAILS = [OWNER_EMAIL, ADMIN_EMAIL, MEMBER_EMAIL, SOLO_EMAIL];
const TEAM_SLUG = "ws-e2e-sezioni";

const ids = { team: "", users: [] as string[] };

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.workspace.deleteMany({ where: { slug: TEAM_SLUG } });
  const [owner, admin, member, solo] = await Promise.all(EMAILS.map((email) => createE2EUser(email, PASSWORD)));
  ids.users = [owner.id, admin.id, member.id, solo.id];
  const team = await prisma.workspace.create({ data: { name: "Squadra sezioni E2E", slug: TEAM_SLUG } });
  ids.team = team.id;
  await prisma.membership.createMany({
    data: [
      { workspace_id: team.id, user_id: owner.id, role: "OWNER" },
      { workspace_id: team.id, user_id: admin.id, role: "ADMIN" },
      { workspace_id: team.id, user_id: member.id, role: "MEMBER" },
    ],
  });
});

test.afterAll(async () => {
  // I workspace personali vanno via in cascata con gli utenti; quello di squadra no.
  await prisma.workspace.deleteMany({ where: { id: ids.team } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.$disconnect();
});

/** Pagina di un utente autenticato; con workspaceId quel workspace diventa quello attivo. */
async function userPage(browser: Browser, email: string, workspaceId?: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  const login = await page.request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(login.status()).toBe(200);
  if (workspaceId) {
    const active = await page.request.post("/api/workspaces/active", { data: { workspaceId } });
    expect(active.status()).toBe(204);
  }
  return page;
}

function sectionNav(page: Page) {
  return page.getByRole("navigation", { name: "Menu del workspace" });
}

/** Zona «Azioni irreversibili» della sezione Generale. */
function dangerZone(page: Page) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: "Azioni irreversibili" }) });
}

/** Apre la sezione e verifica status 200, navigazione con la voce corrente e nessun link a /billing. */
async function openSection(page: Page, path: string, item: string): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(200);
  await expect(sectionNav(page).getByRole("link", { name: item })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('a[href="/billing"]'), path).toHaveCount(0);
}

test.describe("area Workspace", () => {
  // covers: AC-3101-1
  test("MEMBER e ADMIN aprono Generale e Membri; il MEMBER non ha controlli, l'ADMIN ha il modulo d'invito", async ({ browser }) => {
    const member = await userPage(browser, MEMBER_EMAIL, ids.team);
    await openSection(member, "/workspace", "Generale");
    await expect(member.getByLabel("Nome", { exact: true })).toBeDisabled();
    await openSection(member, "/workspace/members", "Membri");
    const members = member.locator("table");
    await expect(members).toContainText("e2e-wss-owner");
    await expect(members).toContainText("Proprietario");
    await expect(members).toContainText("Amministratore");
    await expect(members).toContainText("Membro");
    await expect(member.getByRole("button", { name: "Rimuovi" })).toHaveCount(0);
    await expect(member.getByRole("button", { name: "Invia invito" })).toHaveCount(0);

    const admin = await userPage(browser, ADMIN_EMAIL, ids.team);
    await openSection(admin, "/workspace", "Generale");
    await openSection(admin, "/workspace/members", "Membri");
    await expect(admin.getByRole("heading", { name: "Invita una persona" })).toBeVisible();
    await expect(admin.getByRole("button", { name: "Invia invito" })).toBeVisible();
  });

  // covers: AC-3101-2
  test("l'OWNER con altri membri ha trasferimento e uscita tra le azioni irreversibili, l'OWNER da solo no", async ({ browser }) => {
    const owner = await userPage(browser, OWNER_EMAIL, ids.team);
    await openSection(owner, "/workspace", "Generale");
    await expect(dangerZone(owner).getByRole("heading", { name: "Trasferisci la proprietà" })).toBeVisible();
    await expect(dangerZone(owner).getByRole("button", { name: "Abbandona" })).toBeVisible();

    const solo = await userPage(browser, SOLO_EMAIL);
    await openSection(solo, "/workspace", "Generale");
    await expect(solo.getByRole("heading", { name: "Trasferisci la proprietà" })).toHaveCount(0);
    await expect(solo.getByRole("button", { name: "Abbandona" })).toHaveCount(0);
  });

  // covers: AC-3102-1
  test("con il lancio in pausa /billing porta il MEMBER alla sezione Piano con la frase del lancio in pausa", async ({ browser }) => {
    const member = await userPage(browser, MEMBER_EMAIL, ids.team);

    const response = await member.goto("/billing");

    expect(response?.status()).toBe(200);
    await expect(member).toHaveURL((url) => url.pathname === "/workspace/plan");
    await expect(sectionNav(member).getByRole("link", { name: "Piano" })).toHaveAttribute("aria-current", "page");
    await expect(member.getByText("In questa fase il workspace non ha limiti e non si acquista nessun piano.")).toBeVisible();
  });
});
