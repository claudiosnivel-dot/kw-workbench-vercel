// Gate di T-2504 (AC-2504-1…4) e di T-2506 (AC-2506-2): bacheca del piano per pagina principale con la colonna Senza
// pagina, trascinamento di uno spoke sotto un altro hub, stato da tastiera con Raggruppa per Stato, axe nelle due viste
// e «Inizia a scriverla» dalla barra del prossimo passo. Gate di T-1905 (AC-1905-1, AC-1905-2, AC-1905-5), emendati da
// T-2504: costruzione del piano, spostamento di una keyword dal pannello e axe sulla pagina del piano.
import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { prisma } from "@/lib/prisma";
import { ITALIAN_FIXTURE } from "../helpers/strategy";
import { createE2EUser } from "./credentials";

// Utente dedicato: progetti e piani di questo file non compaiono nelle pagine fotografate dall'utente seed.
// Password generata a ogni esecuzione, mai una credenziale reale.
const PASSWORD = randomBytes(18).toString("hex");
const EMAIL = "e2e-strategy@example.test";
const ids = { user: "", project: "", fresh: "" };
// Piano della fixture italiana di T-1901: 2 hub, 11 pagine, 2 keyword senza pagina.
const HUBS = 2;
const PAGES = 11;
const UNASSIGNED = 2;

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });

/** Progetto con le seed e le keyword tenute della fixture italiana, come dopo un'estrazione. */
async function fixtureProject(userId: string, workspaceId: string, name: string): Promise<string> {
  const project = await prisma.project.create({
    data: { name, workspace_id: workspaceId, created_by_user_id: userId, language_code: "it", country_code: "IT" },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  await prisma.project.update({ where: { id: project.id }, data: { default_subproject_id: section.id } });
  await prisma.seed.createMany({
    data: ITALIAN_FIXTURE.seeds.map((keyword) => ({ project_id: project.id, subproject_id: section.id, keyword })),
  });
  await prisma.keywordCandidate.createMany({
    data: ITALIAN_FIXTURE.keywords.map((item) => {
      const canonical = canonicalizeKeyword(item.keyword, "it");
      return {
        project_id: project.id,
        subproject_id: section.id,
        keyword: item.keyword,
        normalized_keyword: canonical,
        canonical_keyword: canonical,
        source: "MOCK",
        source_query: item.keyword,
        search_intent: item.searchIntent as "mixed",
        keyword_type: item.keywordType as "generic",
        is_question: item.isQuestion ?? false,
        metrics_status: "mock" as const,
        metrics_provider: "MOCK" as const,
        avg_monthly_searches: item.volume,
        score: item.score,
        score_source: "metrics" as const,
      };
    }),
  });
  return project.id;
}

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await createE2EUser(EMAIL, PASSWORD);
  ids.user = user.id;
  ids.project = await fixtureProject(user.id, user.workspaceId, "Progetto piano E2E");
  ids.fresh = await fixtureProject(user.id, user.workspaceId, "Progetto scrittura E2E");
});

test.afterAll(async () => {
  // Il workspace personale, i progetti e i piani vanno via in cascata con l'utente.
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

async function login(page: Page): Promise<void> {
  const response = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
  expect(response.status()).toBe(200);
}

const planUrl = (projectId: string, query = "") => `/projects/${projectId}/plan${query}`;

/** Colonne di pagina principale della bacheca, nell'ordine di lavoro. */
const hubColumns = (page: Page) => page.getByTestId("plan-column");

/** Titoli delle schede di una colonna, dall'alto. */
async function cardTitles(column: Locator): Promise<string[]> {
  return column.getByTestId("plan-card").getByRole("heading", { level: 3 }).allInnerTexts();
}

/** Pannello della pagina aperto dal titolo della sua scheda. */
async function openPanel(page: Page, title: string | RegExp): Promise<Locator> {
  await page.getByTestId("plan-card").getByRole("button", { name: title }).first().click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  return panel;
}

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

test.describe("piano dei contenuti", () => {
  // covers: AC-1905-1
  test("Costruisci il piano senza opzioni avanzate porta alla bacheca con le pagine principali e Senza pagina", async ({ page }) => {
    await login(page);
    await page.goto(planUrl(ids.project));

    const empty = page.locator("section").filter({ has: page.getByRole("heading", { name: "Il piano non c'è ancora" }) });
    await empty.getByRole("button", { name: "Costruisci il piano" }).click();

    await expect(hubColumns(page).first()).toBeVisible();
    await expect(hubColumns(page).first().getByTestId("plan-card").first()).toContainText("Pagina principale");
    await expect(page.getByTestId("plan-column-unassigned").getByRole("button", { name: /calzini tecnici/ })).toBeVisible();
  });

  // covers: AC-2504-1
  test("la bacheca ha una colonna per hub con in cima la pagina principale e la colonna Senza pagina con le keyword", async ({ page }) => {
    await login(page);
    await page.goto(planUrl(ids.project));

    await expect(hubColumns(page)).toHaveCount(HUBS);
    for (const column of await hubColumns(page).all()) {
      await expect(column.getByTestId("plan-card").first()).toContainText("Pagina principale");
    }
    const unassigned = page.getByTestId("plan-column-unassigned");
    await expect(unassigned).toHaveCount(1);
    await expect(unassigned.getByRole("listitem")).toHaveCount(UNASSIGNED);
    await expect(page.getByTestId("plan-progress")).toContainText("0 pubblicate");
  });

  // covers: AC-1905-2
  test("una keyword spostata dal pannello resta nella pagina di destinazione dopo il ricaricamento", async ({ page }) => {
    await login(page);
    await page.goto(planUrl(ids.project));
    const keyword = "scarpe da running";
    const target = /^Migliori scarpe running/;

    const source = await openPanel(page, /^Scarpe running: /);
    await source.getByRole("button", { name: `Sposta «${keyword}» in un'altra pagina` }).click();
    const picker = page.getByRole("dialog", { name: `Sposta «${keyword}» in un'altra pagina` });
    // Le destinazioni hanno il numero nell'ordine di lavoro davanti all'H1.
    const option = picker.locator("option").filter({ hasText: /^\d+\. Migliori scarpe running/ });
    await picker.getByLabel("Pagina").selectOption((await option.getAttribute("value")) ?? "");
    await picker.getByRole("button", { name: "Sposta", exact: true }).click();
    await expect(source.getByRole("button", { name: `Sposta «${keyword}» in un'altra pagina` })).toHaveCount(0);

    await page.reload();
    const destination = await openPanel(page, target);
    await expect(destination.getByText(keyword, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    const origin = await openPanel(page, /^Scarpe running: /);
    await expect(origin.getByText(keyword, { exact: true })).toHaveCount(0);
  });

  // covers: AC-2504-2
  test("uno spoke trascinato sulla colonna del secondo hub ne diventa l'ultima scheda dopo il ricaricamento", async ({ page }) => {
    await login(page);
    await page.goto(planUrl(ids.project));
    const [firstHub, secondHub] = await hubColumns(page).all();
    const spoke = (await cardTitles(firstHub))[1];
    const before = (await cardTitles(secondHub)).length;

    await firstHub.getByTestId("plan-card").nth(1).dragTo(secondHub);
    await expect(secondHub.getByTestId("plan-card")).toHaveCount(before + 1);

    await page.reload();
    const titles = await cardTitles(hubColumns(page).nth(1));
    expect(titles[titles.length - 1]).toBe(spoke);
  });

  // covers: AC-2504-3
  test("lo stato scelto da tastiera porta la scheda tra le Pubblicate di Raggruppa per Stato", async ({ page }) => {
    await login(page);
    await page.goto(planUrl(ids.project));
    // La pagina principale del secondo hub, in cima alla sua colonna.
    const card = hubColumns(page).nth(1).getByTestId("plan-card").first();
    const title = await card.getByRole("heading", { level: 3 }).innerText();

    await card.getByRole("button", { name: /^Stato di «/ }).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("End");
    await expect(page.getByRole("menuitemradio", { name: "Pubblicata" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(card.getByRole("button", { name: /^Stato di «/ })).toContainText("Pubblicata");

    await page.getByRole("group", { name: "Raggruppa per" }).getByRole("link", { name: "Stato" }).click();
    await page.waitForURL(/group=status/);
    const published = page.getByTestId("plan-column").filter({ has: page.getByRole("heading", { level: 2, name: "Pubblicate" }) });
    await expect(published.getByRole("heading", { level: 3, name: title })).toBeVisible();
    await expect(page.getByTestId("plan-progress")).toContainText("1 pubblicata");
  });

  // covers: AC-2504-4
  // covers: AC-1905-5
  test("la pagina del piano non ha violazioni axe serious o critical né in bacheca né in elenco", async ({ page }) => {
    await login(page);
    await page.goto(planUrl(ids.project, "?view=board"));
    await expect(hubColumns(page).first()).toBeVisible();
    expect(await seriousViolations(page), "bacheca").toEqual([]);

    await page.goto(planUrl(ids.project, "?view=list"));
    await expect(page.getByTestId("plan-row").first()).toBeVisible();
    expect(await seriousViolations(page), "elenco").toEqual([]);
  });
});

test.describe("la scrittura nel percorso", () => {
  // covers: AC-2506-2
  test("Inizia a scriverla apre il pannello della prima pagina in scrittura e la barra propone la successiva", async ({ page }) => {
    await login(page);
    await page.goto(planUrl(ids.fresh));
    const empty = page.locator("section").filter({ has: page.getByRole("heading", { name: "Il piano non c'è ancora" }) });
    await empty.getByRole("button", { name: "Costruisci il piano" }).click();
    await expect(hubColumns(page).first()).toBeVisible();
    const [first, second] = await page.getByTestId("plan-card").getByRole("heading", { level: 3 }).allInnerTexts();

    const bar = page.getByRole("region", { name: "Prossimo passo" });
    await expect(bar).toContainText(`«${first}» (n. 1)`);
    await bar.getByRole("button", { name: "Inizia a scriverla" }).click();

    const panel = page.getByRole("dialog", { name: first });
    await expect(panel).toBeVisible();
    await expect(panel.getByLabel("Stato")).toHaveValue("WRITING");
    await expect(page.getByTestId("sidebar-writing")).toHaveText(`0 di ${PAGES} pubblicate`);
    await expect(bar).toContainText(`«${second}» (n. 2)`);
  });
});
