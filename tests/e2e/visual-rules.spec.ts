// Gate di T-2605 (AC-2605-1): regole visive dello stile «A» (D-39) su home, pagina di un argomento, piano e impostazioni,
// nel tema scuro e nel chiaro: un solo pulsante primario visibile fuori da dialoghi e menu, nessun pulsante rosso di
// eliminazione visibile fuori da dialoghi e menu, nessuna scheda dentro un'altra scheda.
import { randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import type { ThemeMode } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { insertStrategy } from "../helpers/strategy";
import { createE2EUser } from "./credentials";

// Utente dedicato: il progetto di questo file non compare nelle pagine fotografate dall'utente seed.
// Password generata a ogni esecuzione, mai una credenziale reale.
const EMAIL = "e2e-visual-rules@example.test";
const PASSWORD = randomBytes(18).toString("hex");
const ids = { user: "", project: "", topic: "" };

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await createE2EUser(EMAIL, PASSWORD);
  ids.user = user.id;
  const project = await prisma.project.create({
    data: { name: "Negozio scarpe running", workspace_id: user.workspaceId, created_by_user_id: user.id, language_code: "it", country_code: "IT" },
  });
  ids.project = project.id;
  const topic = await prisma.subproject.create({ data: { project_id: project.id, name: "Scarpe running", position: 0 } });
  ids.topic = topic.id;
  await prisma.project.update({ where: { id: project.id }, data: { default_subproject_id: topic.id } });
  await prisma.keywordCandidate.createMany({
    data: ["scarpe running", "migliori scarpe running"].map((keyword, index) => ({
      project_id: project.id,
      subproject_id: topic.id,
      keyword,
      normalized_keyword: keyword,
      canonical_keyword: keyword,
      source: "seed",
      source_query: keyword,
      avg_monthly_searches: 900 - index * 100,
      metrics_status: "mock",
    })),
  });
  await insertStrategy({
    projectId: project.id,
    pages: [
      { key: "hub", kind: "HUB" as const, keywords: [{ text: "scarpe running", volume: 900 }] },
      { key: "spoke", kind: "SPOKE" as const, hub: "hub", keywords: [{ text: "migliori scarpe running", volume: 800 }] },
    ],
  });
});

test.afterAll(async () => {
  // Progetto, argomento, keyword e piano vanno via in cascata con l'utente.
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

/** Conteggi delle regole visive sulla pagina aperta (elementi visibili, fuori da [role=dialog] e [role=menu]). */
function visualRuleCounts(page: Page) {
  return page.evaluate(() => {
    const visibleOutside = (selector: string) =>
      [...document.querySelectorAll(selector)].filter((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return !element.closest('[role="dialog"], [role="menu"]') && box.width > 0 && box.height > 0 && style.visibility !== "hidden";
      }).length;
    return {
      primary: visibleOutside(".btn-primary"),
      danger: visibleOutside(".btn-danger"),
      nestedCards: document.querySelectorAll(".card .card").length,
    };
  });
}

test.describe("regole visive del percorso", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  // covers: AC-2605-1
  test("home, argomento, piano e impostazioni rispettano le regole nel tema scuro e nel chiaro", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
    expect(login.status()).toBe(200);
    const pages = ["/", `/projects/${ids.project}/keywords/${ids.topic}`, `/projects/${ids.project}/plan`, `/projects/${ids.project}/settings`];

    for (const theme of ["DARK", "LIGHT"] as ThemeMode[]) {
      await prisma.user.update({ where: { id: ids.user }, data: { theme_mode: theme } });
      for (const path of pages) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("main")).toBeVisible();

        expect({ path, theme, ...(await visualRuleCounts(page)) }).toEqual({ path, theme, primary: 1, danger: 0, nestedCards: 0 });
      }
    }
  });
});
