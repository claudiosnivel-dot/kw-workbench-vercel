// Gate di T-2406 (AC-2406-1, AC-2406-4): il pulsante Esporta della barra in alto apre la finestra già impostata per la
// pagina dell'argomento e scarica l'Excel delle tenute; «Solo quelle che vedi ora» compare solo con un filtro attivo.
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { expect, type Page, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createE2EUser } from "./credentials";

// Utente dedicato: il progetto di questo file non compare nelle pagine fotografate dall'utente seed.
// Password generata a ogni esecuzione, mai una credenziale reale.
const EMAIL = "e2e-export-dialog@example.test";
const PASSWORD = randomBytes(18).toString("hex");
const ids = { user: "", project: "", topic: "" };

test.use({ viewport: { width: 1280, height: 900 } });

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await createE2EUser(EMAIL, PASSWORD);
  ids.user = user.id;
  const project = await prisma.project.create({
    data: { name: "Export negozio", workspace_id: user.workspaceId, created_by_user_id: user.id, language_code: "it", country_code: "IT" },
  });
  ids.project = project.id;
  const topic = await prisma.subproject.create({ data: { project_id: project.id, name: "Scarpe running", position: 0 } });
  ids.topic = topic.id;
  // 24 tenute (5 domande) e 3 scartate.
  await prisma.keywordCandidate.createMany({
    data: Array.from({ length: 27 }, (_, index) => {
      const keyword = index < 5 ? `come scegliere scarpe ${index + 1}` : `scarpe running ${String(index + 1).padStart(2, "0")}`;
      return {
        project_id: project.id,
        subproject_id: topic.id,
        keyword,
        normalized_keyword: keyword,
        canonical_keyword: keyword,
        source: "MOCK",
        source_query: keyword,
        is_question: index < 5,
        avg_monthly_searches: 100 + index,
        score: 50 - index,
        review_status: index >= 24 ? ("rejected" as const) : ("pending" as const),
      };
    }),
  });
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

async function openTopic(page: Page, query = ""): Promise<void> {
  const login = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
  expect(login.status()).toBe(200);
  await page.goto(`/projects/${ids.project}/keywords/${ids.topic}${query}`);
  await expect(page.getByRole("table", { name: "Keyword tenute" })).toBeVisible();
}

test.describe("finestra Esporta", () => {
  // covers: AC-2406-1
  test("dalla pagina dell'argomento parte con le tenute dell'argomento in Excel e scarica 24 righe", async ({ page }) => {
    await openTopic(page);

    await page.getByRole("button", { name: "Esporta", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Esporta" });
    await expect(dialog.getByRole("radio", { name: /^Le keyword/ })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: /^Le tenute di «Scarpe running»/ })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: "Excel" })).toBeChecked();

    const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Scarica l'Excel" }).click()]);
    const workbook = new ExcelJS.Workbook();
    const file = await readFile(await download.path());
    await workbook.xlsx.load(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

    expect(workbook.worksheets[0].actualRowCount - 1).toBe(24);
  });

  // covers: AC-2406-4
  test("con il chip Domande la finestra offre «Solo quelle che vedi ora» con il conteggio, senza chip no", async ({ page }) => {
    await openTopic(page, "?chip=questions");
    await page.getByRole("button", { name: "Esporta", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("radio", { name: "Solo quelle che vedi ora (5)" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto(`/projects/${ids.project}/keywords/${ids.topic}`);
    await page.getByRole("button", { name: "Esporta", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("radio", { name: /^Solo quelle che vedi ora/ })).toHaveCount(0);
  });
});
