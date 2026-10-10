// Gate di T-1905 (AC-1905-1, AC-1905-2, AC-1905-5): generazione automatica dalla pagina Strategia, spostamento di
// una keyword dall'interfaccia che resta dopo il ricaricamento e nessuna violazione axe serious o critical.
import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { prisma } from "@/lib/prisma";
import { ITALIAN_FIXTURE } from "../helpers/strategy";
import { createE2EUser } from "./credentials";

// Utente dedicato: il progetto e le strategie di questo file non compaiono nelle pagine fotografate dall'utente seed.
// Password generata a ogni esecuzione, mai una credenziale reale.
const PASSWORD = randomBytes(18).toString("hex");
const EMAIL = "e2e-strategy@example.test";
const ids = { user: "", project: "" };
let strategyUrl = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await createE2EUser(EMAIL, PASSWORD);
  ids.user = user.id;
  await prisma.userOnboardingProgress.create({
    data: { user_id: user.id, status: "COMPLETED", current_step: "REVIEW_EXPORT", completed_at: new Date() },
  });
  const project = await prisma.project.create({
    data: { name: "Progetto strategia E2E", workspace_id: user.workspaceId, created_by_user_id: user.id, language_code: "it", country_code: "IT" },
  });
  ids.project = project.id;
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
});

test.afterAll(async () => {
  // Il workspace personale, il progetto e le strategie vanno via in cascata con l'utente.
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

async function login(page: Page): Promise<void> {
  const response = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
  expect(response.status()).toBe(200);
}

/** Scheda di una pagina del piano, trovata dal suo H1. */
function pageCard(page: Page, title: string | RegExp): Locator {
  return page.locator("article").filter({ has: page.getByRole("heading", { level: 3, name: title }) });
}

test.describe("pagina Strategia", () => {
  // covers: AC-1905-1
  test("Genera strategia senza impostazioni avanzate porta al piano con gli hub e le non assegnate", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${ids.project}/strategy`);

    await page.getByRole("button", { name: "Genera strategia" }).click();
    await page.waitForURL(/\/projects\/[^/]+\/strategy\/[^/]+$/);
    strategyUrl = page.url();

    await expect(page.getByRole("heading", { level: 2, name: /^Hub 1: Scarpe running: / })).toBeVisible();
    await expect(pageCard(page, /^Scarpe running: /)).toHaveCount(1);
    await expect(page.getByTestId("strategy-unassigned-count")).toHaveText("2 keyword non assegnate");
  });

  // covers: AC-1905-2
  test("una keyword spostata dall'interfaccia resta nella pagina di destinazione dopo il ricaricamento", async ({ page }) => {
    await login(page);
    await page.goto(strategyUrl);
    const keyword = "Seleziona scarpe da running";
    const target = await page.getByRole("heading", { level: 3, name: /^Migliori scarpe running/ }).innerText();
    const source = pageCard(page, /^Scarpe running: /);

    await source.getByRole("checkbox", { name: keyword }).check();
    await source.getByLabel("Sposta le keyword selezionate in").selectOption({ label: target });
    await source.getByRole("button", { name: "Sposta", exact: true }).click();
    await expect(source.getByRole("checkbox", { name: keyword })).toHaveCount(0);

    await page.reload();
    await expect(pageCard(page, target).getByRole("checkbox", { name: keyword })).toHaveCount(1);
    await expect(pageCard(page, /^Scarpe running: /).getByRole("checkbox", { name: keyword })).toHaveCount(0);
  });

  // covers: AC-1905-5
  test("la pagina della strategia non ha violazioni axe serious o critical", async ({ page }) => {
    await login(page);
    await page.goto(strategyUrl);
    await expect(page.getByRole("heading", { level: 2, name: /^Hub 1: / })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
    expect(serious).toEqual([]);
  });
});
