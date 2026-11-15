// Prova del DoD di T-6802 a 390 px di larghezza: con due angoli da valutare nella pilastro l'avviso apre il pannello,
// riquadro dell'angolo e foglio «Nuova pagina» stanno nella finestra senza scorrimento orizzontale, i loro pulsanti
// sono alti almeno 44 px, axe non trova violazioni gravi e «Crea la pagina» lascia il pannello sulla pagina nuova.
import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { insertStrategy } from "../helpers/strategy";
import { createE2EUser } from "./credentials";

// Utente dedicato con il piano: nulla di questo file compare nelle pagine fotografate dell'utente seed. Password
// generata a ogni esecuzione, mai una credenziale reale.
const PASSWORD = randomBytes(18).toString("hex");
const EMAIL = "e2e-plan-angles@example.test";
const PILLAR_H1 = "Noleggio magnetoterapia: la guida pratica";
const ANGLE = "noleggio magnetoterapia per la spalla dolorante dopo un intervento chirurgico";
const NEW_H1 = "Magnetoterapia alla spalla";
const WIDTH = 390;
const ids = { user: "", project: "" };

test.use({ viewport: { width: WIDTH, height: 844 } });

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await createE2EUser(EMAIL, PASSWORD);
  const project = await prisma.project.create({
    data: { name: "Progetto angoli E2E", workspace_id: user.workspaceId, created_by_user_id: user.id, language_code: "it", country_code: "IT" },
  });
  const { keywordIds } = await insertStrategy({
    projectId: project.id,
    pages: [
      {
        key: "hub",
        kind: "HUB",
        h1: PILLAR_H1,
        keywords: [
          { text: "noleggio magnetoterapia", volume: 1600 },
          { text: ANGLE, volume: null },
          { text: "magnetoterapia notturna noleggio", volume: 20 },
        ],
      },
      { key: "spoke", kind: "SPOKE", hub: "hub", h1: "Noleggio magnetoterapia costo", keywords: [{ text: "noleggio magnetoterapia costo", volume: 390 }] },
    ],
  });
  await prisma.strategyKeyword.updateMany({
    where: { id: { in: [keywordIds[ANGLE], keywordIds["magnetoterapia notturna noleggio"]] } },
    data: { angle: true },
  });
  ids.user = user.id;
  ids.project = project.id;
});

test.afterAll(async () => {
  // Il workspace personale, il progetto e il piano vanno via in cascata con l'utente.
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

test.describe("angoli da valutare a 390 px", () => {
  test("riquadro e foglio stanno nella finestra, i pulsanti sono alti 44 px e la pagina nuova si apre nel pannello", async ({ browser }) => {
    const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
    const login = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
    expect(login.status()).toBe(200);
    await page.goto(`/projects/${ids.project}/plan`);

    const notice = page.getByRole("region", { name: "2 angoli da valutare" });
    await expect(notice).toContainText(`«${ANGLE}»`);
    await expectTallButtons(notice);
    await notice.getByRole("button", { name: "Vedi gli angoli" }).click();

    const panel = page.getByRole("dialog", { name: PILLAR_H1 });
    const box = panel.getByRole("region", { name: `Angolo da valutare: ${ANGLE}` });
    await expect(box).toBeVisible();
    await expectFits(page, box, panel);
    await expectTallButtons(box);
    expect(await seriousViolations(page, ".plan-panel")).toEqual([]);

    await box.getByRole("button", { name: "Fanne una pagina" }).click();
    const sheet = page.getByRole("dialog", { name: "Nuova pagina" });
    await expect(sheet).toBeVisible();
    await expectFits(page, sheet, sheet);
    await expectTallButtons(sheet);
    expect(await seriousViolations(page, ".modal-panel")).toEqual([]);

    await sheet.getByLabel("Titolo (H1)").fill(NEW_H1);
    await sheet.getByRole("button", { name: "Crea la pagina" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("dialog", { name: NEW_H1 })).toBeVisible();
    await expect(page.getByRole("dialog", { name: NEW_H1 })).toContainText("Pagina creata da te.");
  });
});
