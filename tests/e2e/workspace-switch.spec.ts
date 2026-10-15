// Gate di T-1504 (AC-1504-1…4): workspace attivo dal selettore della TopNav e dal cookie riverificato, pagina
// /workspace per ruolo e 404 delle pagine di progetto per chi non è membro.
// impacted-by: T-2304, T-2305 (AC-1504-1 e AC-1504-3 emendati: il cambio di workspace sta nel menu dell'utente e la
// home elenca i progetti come schede, non più in una tabella)
// impacted-by: T-3101 (AC-1504-3 emendato: l'elenco dei membri sta in /workspace/members, il nome in /workspace)
import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createE2EUser } from "./credentials";

// Utenti dedicati: progetti e workspace di questo file non compaiono nelle pagine fotografate dall'utente seed.
// Password generata a ogni esecuzione, mai una credenziale reale.
const PASSWORD = randomBytes(18).toString("hex");
const MEMBER_EMAIL = "e2e-ws-member@example.test";
const ADMIN_EMAIL = "e2e-ws-admin@example.test";
const OWNER_EMAIL = "e2e-ws-owner@example.test";
const OUTSIDER_EMAIL = "e2e-ws-outsider@example.test";
const P1 = "Progetto personale E2E";
const P2 = "Progetto di squadra E2E";

const ids = { personal: "", team: "", outsiderPersonal: "", teamProject: "", users: [] as string[] };

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [MEMBER_EMAIL, ADMIN_EMAIL, OWNER_EMAIL, OUTSIDER_EMAIL] } } });
  await prisma.workspace.deleteMany({ where: { slug: "ws-e2e-squadra" } });
  const [member, admin, owner, outsider] = await Promise.all(
    [MEMBER_EMAIL, ADMIN_EMAIL, OWNER_EMAIL, OUTSIDER_EMAIL].map((email) => createE2EUser(email, PASSWORD))
  );
  ids.users = [member.id, admin.id, owner.id, outsider.id];
  ids.personal = member.workspaceId;
  ids.outsiderPersonal = outsider.workspaceId;
  const team = await prisma.workspace.create({ data: { name: "Squadra E2E", slug: "ws-e2e-squadra" } });
  ids.team = team.id;
  await prisma.membership.createMany({
    data: [
      { workspace_id: team.id, user_id: owner.id, role: "OWNER" },
      { workspace_id: team.id, user_id: admin.id, role: "ADMIN" },
      { workspace_id: team.id, user_id: member.id, role: "MEMBER" },
    ],
  });
  await prisma.project.create({ data: { name: P1, workspace_id: member.workspaceId, created_by_user_id: member.id } });
  const teamProject = await prisma.project.create({ data: { name: P2, workspace_id: team.id, created_by_user_id: owner.id } });
  ids.teamProject = teamProject.id;
});

test.afterAll(async () => {
  // I workspace personali e i loro progetti vanno via in cascata con gli utenti; quello di squadra no.
  await prisma.workspace.deleteMany({ where: { id: ids.team } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.$disconnect();
});

async function login(page: Page, email: string): Promise<void> {
  const response = await page.request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(response.status()).toBe(200);
}

async function activate(page: Page, workspaceId: string): Promise<void> {
  const response = await page.request.post("/api/workspaces/active", { data: { workspaceId } });
  expect(response.status()).toBe(204);
}

/** Elenco dei progetti della home (T-2305): le schede stanno nel main, la barra in alto non ne mostra i nomi. */
function projectsTable(page: Page) {
  return page.getByRole("main");
}

/** Voce del workspace nel menu dell'utente (T-2304): il menu si apre dal pulsante con il nome dell'utente. */
async function workspaceItem(page: Page, name: string) {
  await page.getByRole("button", { name: /^Menu di / }).click();
  return page.getByRole("menuitemradio", { name });
}

async function newUserPage(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await login(page, email);
  return page;
}

test.describe("workspace attivo", () => {
  // covers: AC-1504-1
  test("la scelta nel selettore cambia la dashboard e resta dopo il ricaricamento", async ({ page }) => {
    await login(page, MEMBER_EMAIL);
    await activate(page, ids.personal);
    await page.goto("/");
    await expect(projectsTable(page)).toContainText(P1);

    const saved = page.waitForResponse((response) => response.url().endsWith("/api/workspaces/active") && response.status() === 204);
    await (await workspaceItem(page, "Squadra E2E")).click();
    await saved;

    await expect(projectsTable(page)).toContainText(P2);
    await expect(projectsTable(page)).not.toContainText(P1);
    await page.reload();
    await expect(projectsTable(page)).toContainText(P2);
    await expect(projectsTable(page)).not.toContainText(P1);
    await expect(await workspaceItem(page, "Squadra E2E")).toHaveAttribute("aria-checked", "true");
  });

  // covers: AC-1504-2
  test("un cookie con un workspace non accessibile ricade su quello personale e viene riscritto", async ({ page, context }) => {
    await login(page, MEMBER_EMAIL);
    await context.addCookies([{ name: "kwb_workspace", value: ids.outsiderPersonal, url: "http://localhost:3100" }]);

    const rewritten = page.waitForResponse((response) => response.url().endsWith("/api/workspaces/active"));
    await page.goto("/");
    const response = await rewritten;

    await expect(projectsTable(page)).toContainText(P1);
    await expect(projectsTable(page)).not.toContainText(P2);
    expect(response.status()).toBe(204);
    expect(await response.headerValue("set-cookie")).toContain(`kwb_workspace=${ids.personal}`);
    const cookie = (await context.cookies()).find((item) => item.name === "kwb_workspace");
    expect(cookie?.value).toBe(ids.personal);
  });
});

test.describe("pagina del workspace", () => {
  // covers: AC-1504-3
  test("il MEMBER vede membri e ruoli senza controlli; l'ADMIN rinomina e il selettore mostra il nuovo nome", async ({
    browser,
  }) => {
    const memberPage = await newUserPage(browser, MEMBER_EMAIL);
    await activate(memberPage, ids.team);
    await memberPage.goto("/workspace/members");
    const members = memberPage.locator("table");
    await expect(members).toContainText("e2e-ws-owner");
    await expect(members).toContainText("Proprietario");
    await expect(members).toContainText("Amministratore");
    await expect(members).toContainText("Membro");
    await expect(memberPage.getByRole("button", { name: "Rimuovi" })).toHaveCount(0);
    await memberPage.goto("/workspace");
    await expect(memberPage.getByLabel("Nome", { exact: true })).toBeDisabled();

    const adminPage = await newUserPage(browser, ADMIN_EMAIL);
    await activate(adminPage, ids.team);
    await adminPage.goto("/workspace");
    await adminPage.getByLabel("Nome", { exact: true }).fill("Team SEO");
    await adminPage.getByRole("button", { name: "Salva nome" }).click();
    await expect(adminPage.getByText("Nome aggiornato.")).toBeVisible();
    await expect(await workspaceItem(adminPage, "Team SEO")).toHaveAttribute("aria-checked", "true");
  });

  // covers: AC-1504-4
  test("chi non è membro riceve 404 sulla pagina del progetto e il nome non compare", async ({ page }) => {
    await login(page, OUTSIDER_EMAIL);

    const response = await page.goto(`/projects/${ids.teamProject}`);

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Pagina non trovata" })).toBeVisible();
    expect(await page.content()).not.toContain(P2);
  });
});
