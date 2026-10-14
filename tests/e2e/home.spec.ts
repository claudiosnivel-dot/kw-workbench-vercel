// Gate di T-2305 (AC-2305-1, AC-2305-2, AC-2305-4) e di T-2306 (AC-2306-2): home con l'avvio da un campo al primo
// accesso e le schede dei progetti con il loro prossimo passo; l'onboarding a passi non esiste più. Gate di T-2506
// (AC-2506-3): la scheda di un progetto con il piano mostra l'avanzamento della scrittura.
import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { insertStrategy } from "../helpers/strategy";
import { createE2EUser } from "./credentials";

// Utenti dedicati, ciascuno con il suo workspace personale: nulla compare nelle pagine fotografate dall'utente seed.
// Password generata a ogni esecuzione, mai una credenziale reale.
const PASSWORD = randomBytes(18).toString("hex");
const FIRST_EMAIL = "e2e-home-first@example.test";
const PROJECTS_EMAIL = "e2e-home-projects@example.test";
const REMOVED_EMAIL = "e2e-home-onboarding@example.test";
const EMAILS = [FIRST_EMAIL, PROJECTS_EMAIL, REMOVED_EMAIL];
const HOUR_MS = 60 * 60 * 1000;
const userIds: string[] = [];
const workspaces = { first: "" };

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  const [first, withProjects, removed] = await Promise.all(EMAILS.map((email) => createE2EUser(email, PASSWORD)));
  userIds.push(first.id, withProjects.id, removed.id);
  workspaces.first = first.workspaceId;

  // Tre progetti, dal più recente: keyword senza piano, una seed senza keyword, nessun argomento.
  const now = Date.now();
  const project = (name: string, hoursAgo: number) =>
    prisma.project.create({
      data: { name, workspace_id: withProjects.workspaceId, created_by_user_id: withProjects.id, last_activity_at: new Date(now - hoursAgo * HOUR_MS) },
    });
  const withKeywords = await project("Negozio scarpe running", 1);
  const withSeed = await project("Pizzeria a Milano", 2);
  await project("B&B in Puglia", 3);
  const topic = await prisma.subproject.create({ data: { project_id: withKeywords.id, name: "Scarpe running", position: 0 } });
  await prisma.keywordCandidate.createMany({
    data: ["scarpe running", "scarpe running uomo"].map((keyword) => ({
      project_id: withKeywords.id,
      subproject_id: topic.id,
      keyword,
      normalized_keyword: keyword,
      canonical_keyword: keyword,
      source: "MOCK",
      source_query: keyword,
    })),
  });
  const seedTopic = await prisma.subproject.create({ data: { project_id: withSeed.id, name: "Pizzeria", position: 0 } });
  await prisma.seed.create({ data: { project_id: withSeed.id, subproject_id: seedTopic.id, keyword: "pizzeria milano" } });

  // Un quarto progetto, il meno recente, con un piano di 9 pagine di cui 3 pubblicate (T-2506).
  const withPlan = await project("Blog di corsa", 4);
  const planTopic = await prisma.subproject.create({ data: { project_id: withPlan.id, name: "Corsa", position: 0 } });
  await prisma.keywordCandidate.create({
    data: {
      project_id: withPlan.id,
      subproject_id: planTopic.id,
      keyword: "corsa",
      normalized_keyword: "corsa",
      canonical_keyword: "corsa",
      source: "MOCK",
      source_query: "corsa",
    },
  });
  await insertStrategy({
    projectId: withPlan.id,
    pages: Array.from({ length: 9 }, (_, index) => ({
      key: `p${index}`,
      kind: index === 0 ? ("HUB" as const) : ("SPOKE" as const),
      hub: index === 0 ? undefined : "p0",
      status: index < 3 ? ("PUBLISHED" as const) : ("TODO" as const),
      keywords: [{ text: `corsa ${index}`, volume: 100 - index }],
    })),
  });
});

test.afterAll(async () => {
  // La ricerca avviata dall'avvio rapido aspetta il finto autocomplete: si ferma prima di eliminare l'utente.
  await prisma.job.updateMany({
    where: { project: { workspace_id: workspaces.first }, status: { in: ["pending", "running"] } },
    data: { status: "canceled", completed_at: new Date() },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

async function login(page: Page, email: string): Promise<void> {
  const response = await page.request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(response.status()).toBe(200);
}

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

test.describe("home", () => {
  // covers: AC-2305-4
  test("la home al primo accesso e quella con i progetti non hanno violazioni axe serious o critical", async ({ browser }) => {
    const firstPage = await (await browser.newContext()).newPage();
    await login(firstPage, FIRST_EMAIL);
    await firstPage.goto("/");
    await expect(firstPage.getByRole("heading", { name: "Di cosa parla il tuo sito?" })).toBeVisible();
    expect(await seriousViolations(firstPage), "primo accesso").toEqual([]);

    const projectsPage = await (await browser.newContext()).newPage();
    await login(projectsPage, PROJECTS_EMAIL);
    await projectsPage.goto("/");
    await expect(projectsPage.getByRole("heading", { name: "I tuoi progetti" })).toBeVisible();
    expect(await seriousViolations(projectsPage), "con progetti").toEqual([]);

    await projectsPage.goto("/projects/new");
    await projectsPage.waitForURL((url) => url.pathname === "/");
  });

  // covers: AC-2305-2
  test("ogni scheda ha il suo prossimo passo, un solo primario pieno e nessuna tabella dei job", async ({ page }) => {
    await login(page, PROJECTS_EMAIL);
    await page.goto("/");

    const card = (name: string) => page.getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });
    await expect(card("Negozio scarpe running").getByRole("button", { name: "Costruisci il piano" })).toBeVisible();
    await expect(card("Pizzeria a Milano").getByRole("button", { name: "Avvia la ricerca" })).toBeVisible();
    await expect(card("B&B in Puglia").getByRole("button", { name: "Aggiungi un argomento" })).toBeVisible();
    await expect(page.locator(".btn-primary")).toHaveCount(1);
    await expect(page.locator("table")).toHaveCount(0);
  });

  // covers: AC-2305-1
  test("al primo accesso un esempio riempie il campo e l'invio porta ai risultati con la ricerca in corso", async ({ page }) => {
    await login(page, FIRST_EMAIL);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Di cosa parla il tuo sito?" })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(1);
    await page.getByRole("button", { name: "b&b in puglia" }).click();
    await expect(page.getByRole("textbox")).toHaveValue("b&b in puglia");

    await page.getByRole("button", { name: "Trova le keyword" }).click();
    // impacted-by: T-2403 (i risultati del nuovo argomento sono la pagina delle sue keyword)
    await page.waitForURL((url) => /^\/projects\/[^/]+\/keywords\/[^/]+$/.test(url.pathname));
    const bar = page.getByRole("region", { name: "Prossimo passo" });
    await expect(bar).toContainText("Sto cercando le keyword…");
    await expect(bar.getByRole("progressbar")).toBeVisible();
  });
});

test.describe("scrittura nella home", () => {
  // covers: AC-2506-3
  test("la scheda di un progetto con il piano mostra Scrittura: 3 di 9 pubblicate e una barra di avanzamento", async ({ page }) => {
    await login(page, PROJECTS_EMAIL);
    await page.goto("/");

    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Blog di corsa" }) });
    await expect(card).toContainText("Scrittura: 3 di 9 pubblicate");
    await expect(card.getByRole("progressbar", { name: "Avanzamento della scrittura" })).toBeVisible();
  });
});

test.describe("onboarding rimosso", () => {
  // covers: AC-2306-2
  test("la home del primo accesso si apre senza reindirizzare e i vecchi indirizzi portano alla home", async ({ page }) => {
    await login(page, REMOVED_EMAIL);

    const home = await page.goto("/");
    expect(home?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.getByRole("heading", { name: "Di cosa parla il tuo sito?" })).toBeVisible();

    for (const path of ["/onboarding", "/onboarding/seeds"]) {
      await page.goto(path);
      expect(new URL(page.url()).pathname, path).toBe("/");
    }
    const state = await page.request.get("/api/onboarding/state");
    expect(state.status()).toBe(404);
  });
});
