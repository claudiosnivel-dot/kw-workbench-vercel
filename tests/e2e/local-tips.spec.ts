// Prova del DoD di T-7001 e T-7002 a 390 px di larghezza: con una pagina locale da 16 keyword l'avviso «Consigli» apre
// il pannello, riquadro dei consigli e dialogo «Scegli le città da scartare» stanno nella finestra senza scorrimento
// orizzontale, i loro pulsanti sono alti almeno 44 px e axe non trova violazioni gravi; lo scarto rende scartata la riga
// dei risultati senza cambiare il piano e «Fanne una pagina» lascia il pannello sulla pagina locale nuova.
import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { insertStrategy } from "../helpers/strategy";
import { createE2EUser } from "./credentials";

// Utente dedicato con il piano: nulla di questo file compare nelle pagine fotografate dell'utente seed. Password
// generata a ogni esecuzione, mai una credenziale reale.
const PASSWORD = randomBytes(18).toString("hex");
const EMAIL = "e2e-local-tips@example.test";
const LOCAL_H1 = "Noleggio magnetoterapia vicino a me: dove andare e cosa sapere";
const CITIES = ["roma", "milano", "napoli", "torino", "palermo", "genova", "bologna", "firenze", "bari", "catania", "verona", "padova", "trieste", "brescia", "reggio nell'emilia"];
const city = (name: string) => `noleggio magnetoterapia ${name}`;
const WIDTH = 390;
const ids = { user: "", project: "", strategy: "", local: "" };

test.use({ viewport: { width: WIDTH, height: 844 } });

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await createE2EUser(EMAIL, PASSWORD);
  const project = await prisma.project.create({
    data: { name: "Progetto città E2E", workspace_id: user.workspaceId, created_by_user_id: user.id, language_code: "it", country_code: "IT" },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Città", position: 0 } });
  const texts = ["noleggio magnetoterapia vicino a me", ...CITIES.map(city)];
  const { strategyId, pageIds, keywordIds } = await insertStrategy({
    projectId: project.id,
    pages: [
      { key: "hub", kind: "HUB", h1: "Noleggio magnetoterapia: la guida pratica", keywords: [{ text: "noleggio magnetoterapia", volume: 1600 }] },
      { key: "local", kind: "SPOKE", hub: "hub", h1: LOCAL_H1, keywords: texts.map((text, index) => ({ text, volume: 900 - index * 40 })) },
    ],
  });
  await prisma.strategyPage.update({ where: { id: pageIds.local }, data: { content_type: "local" } });
  // Ogni keyword della pagina locale ha la sua riga dei risultati, come in un piano costruito dal lavoro di piano.
  for (const text of texts) {
    const candidate = await prisma.keywordCandidate.create({
      data: {
        project_id: project.id,
        subproject_id: section.id,
        keyword: text,
        normalized_keyword: text,
        canonical_keyword: text,
        source: "seed",
        source_query: text,
      },
    });
    await prisma.strategyKeyword.update({ where: { id: keywordIds[text] }, data: { source_keyword_id: candidate.id } });
  }
  Object.assign(ids, { user: user.id, project: project.id, strategy: strategyId, local: pageIds.local });
});

test.afterAll(async () => {
  // Il workspace personale, il progetto, i risultati e il piano vanno via in cascata con l'utente.
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

/** L'elemento sta tutto nella finestra e né la pagina né il contenitore scorrono in orizzontale. */
async function expectFits(page: Page, element: Locator, scroller: Locator) {
  const box = (await element.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(WIDTH);
  expect(await scroller.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(WIDTH);
}

async function expectTallButtons(container: Locator) {
  const buttons = await container.getByRole("button").all();
  expect(buttons.length).toBeGreaterThan(0);
  for (const button of buttons) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
}

async function seriousViolations(page: Page, selector: string): Promise<string[]> {
  const results = await new AxeBuilder({ page }).include(selector).analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

test.describe("consigli sulla pagina locale a 390 px", () => {
  test("riquadro e dialogo stanno nella finestra, lo scarto tocca solo i risultati e «Fanne una pagina» apre la pagina nuova", async ({ browser }) => {
    const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
    const login = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
    expect(login.status()).toBe(200);
    await page.goto(`/projects/${ids.project}/plan`);

    const notice = page.getByRole("region", { name: "La pagina locale ha 16 città" });
    await expectTallButtons(notice);
    await notice.getByRole("button", { name: "Consigli" }).click();

    const panel = page.getByRole("dialog", { name: LOCAL_H1 });
    const tips = panel.getByRole("region", { name: "16 città in una sola pagina" });
    await expect(tips).toBeVisible();
    await expectFits(page, tips, panel);
    await expectTallButtons(tips);
    expect(await seriousViolations(page, ".plan-panel")).toEqual([]);

    await tips.getByRole("button", { name: "Scegli le città da scartare" }).click();
    const dialog = page.getByRole("dialog", { name: "Scegli le città da scartare" });
    await expect(dialog).toBeVisible();
    await expectFits(page, dialog, dialog);
    await expectTallButtons(dialog);
    expect(await seriousViolations(page, ".modal-panel")).toEqual([]);

    const version = (await prisma.strategy.findUniqueOrThrow({ where: { id: ids.strategy } })).version;
    await dialog.getByRole("checkbox", { name: new RegExp(city("trieste")) }).check();
    await dialog.getByRole("checkbox", { name: new RegExp(city("brescia")) }).check();
    await dialog.getByRole("button", { name: "Scarta le città scelte" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Le città scartate escono dal piano alla prossima «Rigenera».");
    const rows = await prisma.keywordCandidate.findMany({ where: { project_id: ids.project, review_status: "rejected" }, select: { keyword: true } });
    expect(rows.map((row) => row.keyword).sort()).toEqual([city("brescia"), city("trieste")]);
    expect((await prisma.strategy.findUniqueOrThrow({ where: { id: ids.strategy } })).version).toBe(version);
    await dialog.getByRole("button", { name: "Chiudi" }).click();
    await expect(dialog).toBeHidden();

    await tips.getByRole("button", { name: `Fanne una pagina per «${city("roma")}»` }).click();
    const created = page.getByRole("dialog", { name: /^Noleggio magnetoterapia roma: / });
    await expect(created).toBeVisible();
    await expect(created).toContainText("Pagina creata da te.");
    expect(await prisma.strategyKeyword.count({ where: { page_id: ids.local } })).toBe(15);
  });
});
