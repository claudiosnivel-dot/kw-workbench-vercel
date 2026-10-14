// Gate di T-2303 (AC-2303-1, AC-2303-2, AC-2303-4): struttura del progetto con la barra laterale a tappe, il menu ☰ da
// telefono e la barra del prossimo passo, senza violazioni axe serious o critical. Gate di T-2603 (AC-2603-1) e di
// AC-808-4 emendato: gli argomenti si riordinano da tastiera con «Sposta su» del loro menu ⋯ nella barra laterale.
import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createE2EUser } from "./credentials";

// Utente dedicato: il progetto di questo file non compare nelle pagine fotografate dall'utente seed.
// Password generata a ogni esecuzione, mai una credenziale reale.
const EMAIL = "e2e-project-shell@example.test";
const PASSWORD = randomBytes(18).toString("hex");
const ids = { user: "", project: "", first: "", reorder: "" };

function keywordRows(projectId: string, subprojectId: string, keywords: string[]) {
  return keywords.map((keyword) => ({
    project_id: projectId,
    subproject_id: subprojectId,
    keyword,
    normalized_keyword: keyword,
    canonical_keyword: keyword,
    source: "MOCK",
    source_query: keyword,
  }));
}

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await createE2EUser(EMAIL, PASSWORD);
  ids.user = user.id;
  const project = await prisma.project.create({
    data: { name: "Negozio scarpe running", workspace_id: user.workspaceId, created_by_user_id: user.id, language_code: "it", country_code: "IT" },
  });
  ids.project = project.id;
  const first = await prisma.subproject.create({ data: { project_id: project.id, name: "Scarpe running", position: 0 } });
  const second = await prisma.subproject.create({ data: { project_id: project.id, name: "Trail running", position: 1 } });
  ids.first = first.id;
  await prisma.project.update({ where: { id: project.id }, data: { default_subproject_id: first.id } });
  await prisma.keywordCandidate.createMany({
    data: [
      ...keywordRows(project.id, first.id, ["scarpe running", "migliori scarpe running", "scarpe running donna"]),
      ...keywordRows(project.id, second.id, ["trail running", "scarpe trail"]),
    ],
  });

  // Progetto con tre argomenti A, B e C per il riordino (T-2603).
  const reorder = await prisma.project.create({
    data: { name: "Riordino argomenti", workspace_id: user.workspaceId, created_by_user_id: user.id, language_code: "it", country_code: "IT" },
  });
  ids.reorder = reorder.id;
  await prisma.subproject.createMany({
    data: ["A", "B", "C"].map((name, position) => ({ project_id: reorder.id, name, position })),
  });
});

test.afterAll(async () => {
  // Progetto, argomenti e keyword vanno via in cascata con l'utente.
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

async function logIn(page: Page): Promise<void> {
  const login = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
  expect(login.status()).toBe(200);
}

async function openFirstTopic(page: Page): Promise<void> {
  await logIn(page);
  // impacted-by: T-2403 (i risultati dell'argomento sono la pagina delle sue keyword)
  await page.goto(`/projects/${ids.project}/keywords/${ids.first}`);
}

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

test.describe("struttura del progetto da computer", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  // covers: AC-2303-1
  test("barra laterale con le tappe e gli argomenti, barra in fondo con Costruisci il piano", async ({ page }) => {
    await openFirstTopic(page);

    const sidebar = page.getByRole("navigation", { name: "Percorso del progetto" });
    await expect(sidebar).toBeVisible();
    const keywordsStep = sidebar.getByRole("link", { name: /Keyword/ });
    await expect(keywordsStep).toContainText("fatto");
    await expect(keywordsStep).toContainText("5 tenute");
    const firstTopic = sidebar.getByRole("link", { name: "Scarpe running 3" });
    await expect(firstTopic).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: "Trail running 2" })).not.toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: /Piano dei contenuti/ })).toContainText("da creare");

    const bar = page.getByRole("region", { name: "Prossimo passo" });
    await expect(bar.getByRole("button", { name: "Costruisci il piano" })).toBeVisible();
  });

  // covers: AC-2303-4
  test("i risultati di un argomento non hanno violazioni axe serious o critical", async ({ page }) => {
    await openFirstTopic(page);
    await expect(page.getByRole("navigation", { name: "Percorso del progetto" })).toBeVisible();

    expect(await seriousViolations(page)).toEqual([]);
  });

  // covers: AC-2603-1
  // covers: AC-808-4
  test("con la tastiera, Sposta su due volte nel menu ⋯ di C porta l'ordine a C, A, B anche dopo il ricaricamento", async ({ page }) => {
    await logIn(page);
    await page.goto(`/projects/${ids.reorder}/keywords`);
    const sidebar = page.getByRole("navigation", { name: "Percorso del progetto" });
    const topics = sidebar.locator(".project-topics a");
    await expect(topics).toHaveText([/^A/, /^B/, /^C/]);

    for (const expected of [
      [/^A/, /^C/, /^B/],
      [/^C/, /^A/, /^B/],
    ]) {
      const menu = sidebar.getByRole("button", { name: "Azioni dell'argomento C" });
      await menu.focus();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByRole("menuitem", { name: "Sposta su" })).toBeFocused();
      const saved = page.waitForResponse((response) => response.url().endsWith("/subprojects/reorder") && response.status() === 200);
      await page.keyboard.press("Enter");
      await saved;
      await expect(topics).toHaveText(expected);
    }

    await page.reload();
    await expect(topics).toHaveText([/^C/, /^A/, /^B/]);
  });
});

test.describe("struttura del progetto da telefono", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // covers: AC-2303-2
  test("la barra laterale si apre dal pulsante ☰ e si chiude con Esc restituendo il focus", async ({ page }) => {
    await openFirstTopic(page);
    const toggle = page.getByRole("button", { name: "Menu del progetto" });
    await expect(toggle).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Percorso del progetto" })).toBeHidden();

    await toggle.click();
    const panel = page.getByRole("dialog", { name: "Percorso del progetto" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("link", { name: "Scarpe running 3" })).toBeVisible();
    await expect(panel.getByRole("link", { name: "Trail running 2" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  // covers: AC-2303-4
  test("con il menu aperto la pagina non ha violazioni axe serious o critical", async ({ page }) => {
    await openFirstTopic(page);
    await page.getByRole("button", { name: "Menu del progetto" }).click();
    await expect(page.getByRole("dialog", { name: "Percorso del progetto" })).toBeVisible();

    expect(await seriousViolations(page)).toEqual([]);
  });
});
