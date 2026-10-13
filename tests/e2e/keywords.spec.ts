// Gate di T-2403 (AC-2403-1, AC-2403-2, AC-2403-3, AC-2403-5) e di T-2405 (AC-2405-1): pagina delle keyword di un
// argomento con un clic per scartare, chip, scartate in fondo, resa da telefono e accessibilità; «Aggiungi i volumi» solo
// quando le tenute non hanno ancora le ricerche al mese.
import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createE2EUser } from "./credentials";

// Utente dedicato: i progetti di questo file non compaiono nelle pagine fotografate dall'utente seed.
// Password generata a ogni esecuzione, mai una credenziale reale.
const EMAIL = "e2e-keywords@example.test";
const PASSWORD = randomBytes(18).toString("hex");
const state = { userId: "", workspaceId: "" };

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await createE2EUser(EMAIL, PASSWORD);
  state.userId = user.id;
  state.workspaceId = user.workspaceId;
});

test.afterAll(async () => {
  // Progetti, argomenti e keyword vanno via in cascata con l'utente.
  await prisma.user.deleteMany({ where: { id: state.userId } });
  await prisma.$disconnect();
});

/**
 * Progetto nuovo con l'argomento A di 28 keyword tenute senza volumi (6 domande, con il punteggio più basso: la prima
 * riga non è una domanda) e l'argomento B con keyword tenute con volume. A è l'argomento predefinito.
 */
async function createProject(name: string) {
  const project = await prisma.project.create({
    data: { name, workspace_id: state.workspaceId, created_by_user_id: state.userId, language_code: "it", country_code: "IT" },
  });
  const topicA = await prisma.subproject.create({ data: { project_id: project.id, name: "Scarpe running", position: 0 } });
  const topicB = await prisma.subproject.create({ data: { project_id: project.id, name: "Calzini", position: 1 } });
  await prisma.project.update({ where: { id: project.id }, data: { default_subproject_id: topicA.id } });
  const rows = (topicId: string, keywords: string[], extra: (index: number) => Record<string, unknown>) =>
    keywords.map((keyword, index) => ({
      project_id: project.id,
      subproject_id: topicId,
      keyword,
      normalized_keyword: keyword,
      canonical_keyword: keyword,
      source: "MOCK",
      source_query: keyword,
      ...extra(index),
    }));
  await prisma.keywordCandidate.createMany({
    data: [
      ...rows(topicA.id, Array.from({ length: 22 }, (_, index) => `scarpe running modello ${String(index + 1).padStart(2, "0")}`), (index) => ({
        score: 90 - index,
      })),
      ...rows(topicA.id, Array.from({ length: 6 }, (_, index) => `come scegliere scarpe running ${index + 1}`), (index) => ({
        score: 10 - index,
        is_question: true,
        keyword_type: "question",
      })),
      ...rows(topicB.id, ["calzini tecnici", "calzini running"], (index) => ({ avg_monthly_searches: 100 * (index + 1), score: 50 })),
    ],
  });
  return { projectId: project.id, topicA: topicA.id, topicB: topicB.id };
}

async function login(page: Page): Promise<void> {
  const response = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
  expect(response.status()).toBe(200);
}

const keptTable = (page: Page) => page.getByRole("table", { name: "Keyword tenute" });

test.describe("pagina delle keyword da computer", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  // covers: AC-2403-1
  test("il progetto apre l'argomento, un clic scarta la prima riga e la keyword compare tra le scartate", async ({ page }) => {
    const { projectId, topicA } = await createProject("Negozio uno");
    await login(page);

    await page.goto(`/projects/${projectId}`);
    await page.waitForURL((url) => url.pathname === `/projects/${projectId}/keywords/${topicA}`);
    await expect(page.getByText("28 trovate · 28 tenute")).toBeVisible();

    const firstRow = keptTable(page).getByRole("row").nth(1);
    const keyword = "scarpe running modello 01";
    await expect(firstRow).toContainText(keyword);
    await firstRow.getByRole("button", { name: `Scarta ${keyword}` }).click();

    await expect(keptTable(page).getByText(keyword, { exact: true })).toHaveCount(0);
    await expect(page.getByText("28 trovate · 27 tenute")).toBeVisible();

    await page.getByRole("button", { name: /^Scartate/ }).click();
    const discarded = page.getByRole("table", { name: "Keyword scartate" });
    await expect(discarded.getByRole("button", { name: `Tieni ${keyword}` })).toBeVisible();
  });

  // covers: AC-2403-2
  test("il chip Domande e «Scarta queste 6» scartano le domande e il chip sparisce", async ({ page }) => {
    const { projectId, topicA } = await createProject("Negozio due");
    await login(page);
    await page.goto(`/projects/${projectId}/keywords/${topicA}`);

    const chips = page.getByRole("navigation", { name: "Filtri rapidi" });
    await chips.getByRole("link", { name: /Domande/ }).click();
    await page.waitForURL((url) => url.searchParams.get("chip") === "questions");
    await expect(keptTable(page).getByRole("row")).toHaveCount(7);
    await expect(page.getByRole("button", { name: "Scartate (0)" })).toBeVisible();

    await page.getByRole("button", { name: "Scarta queste 6" }).click();

    await expect(page.getByRole("button", { name: "Scartate (6)" })).toBeVisible();
    await expect(keptTable(page)).toHaveCount(0);
    await expect(page.getByText("Nessuna keyword tenuta con questi filtri.")).toBeVisible();
    await expect(chips.getByRole("link", { name: /Domande/ })).toHaveCount(0);
  });

  // covers: AC-2403-5
  test("con il pannello Filtri aperto la pagina non ha violazioni axe serious o critical", async ({ page }) => {
    const { projectId, topicA } = await createProject("Negozio tre");
    await login(page);
    await page.goto(`/projects/${projectId}/keywords/${topicA}`);

    await page.getByRole("button", { name: "Filtri", exact: true }).click();
    await expect(page.getByLabel("Ricerche al mese, minimo")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
    expect(serious).toEqual([]);
  });

  // covers: AC-2405-1
  test("Aggiungi i volumi compare solo nell'argomento le cui tenute non hanno volumi", async ({ page }) => {
    const { projectId, topicA, topicB } = await createProject("Negozio quattro");
    await login(page);

    await page.goto(`/projects/${projectId}/keywords/${topicA}`);
    await expect(page.getByRole("button", { name: "Aggiungi i volumi" })).toBeVisible();

    await page.goto(`/projects/${projectId}/keywords/${topicB}`);
    await expect(keptTable(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Aggiungi i volumi" })).toHaveCount(0);
  });
});

test.describe("pagina delle keyword da telefono", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // covers: AC-2403-3
  test("la prima riga dell'elenco è visibile senza scorrere e non c'è il blocco Keyword Planner", async ({ page }) => {
    const { projectId, topicA } = await createProject("Negozio cinque");
    await login(page);
    await page.goto(`/projects/${projectId}/keywords/${topicA}`);

    const firstRow = keptTable(page).getByRole("row").nth(1);
    await expect(firstRow).toBeVisible();
    const box = await firstRow.boundingBox();
    expect(box?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(844);
    await expect(page.getByText("Keyword Planner")).toHaveCount(0);
  });
});
