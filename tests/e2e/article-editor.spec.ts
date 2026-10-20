// Gate di T-4401 (AC-4401-4): l'editor dell'articolo di un progetto di un altro workspace risponde 404 a un MEMBER che
// non ne fa parte, senza mostrare il testo. In più il membro del progetto apre lo stesso indirizzo e legge l'articolo
// con il segnaposto immagine, e axe non trova violazioni gravi sulla pagina.
import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type Page, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { insertStrategy } from "../helpers/strategy";
import { createE2EUser } from "./credentials";

// Utenti dedicati, ognuno con il suo workspace personale; password generate a ogni esecuzione, mai credenziali reali.
const PASSWORD = randomBytes(18).toString("hex");
const OWNER_EMAIL = "e2e-article-owner@example.test";
const OUTSIDER_EMAIL = "e2e-article-outsider@example.test";
const SPOKE_TITLE = "Scarpe running donna: guida completa";
const INTRO = "Chi cerca scarpe running donna parte dalla taglia giusta.";
const ids = { owner: "", outsider: "", project: "", page: "" };

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, OUTSIDER_EMAIL] } } });
  const owner = await createE2EUser(OWNER_EMAIL, PASSWORD);
  const outsider = await createE2EUser(OUTSIDER_EMAIL, PASSWORD);
  const project = await prisma.project.create({
    data: { name: "Progetto articoli E2E", workspace_id: owner.workspaceId, created_by_user_id: owner.id, language_code: "it", country_code: "IT" },
  });
  const plan = await insertStrategy({
    projectId: project.id,
    pages: [
      { key: "hub", kind: "HUB", keywords: [{ text: "scarpe running", volume: 9900 }], h1: "Scarpe running: la guida pratica" },
      { key: "spoke", kind: "SPOKE", hub: "hub", keywords: [{ text: "scarpe running donna", volume: 2100 }], h1: SPOKE_TITLE },
    ],
  });
  await prisma.article.create({
    data: {
      page_id: plan.pageIds.spoke,
      project_id: project.id,
      length: "MEDIUM",
      status: "READY",
      meta_title: "Scarpe running donna: come sceglierle",
      meta_description: "Come scegliere le scarpe running da donna giuste per correre senza dolori.",
      slug: "scarpe-running-donna",
      images: [
        {
          position: 0,
          cover: true,
          purpose: "Copertina",
          alt: "Scarpe da corsa su una pista",
          fileName: "scarpe-running-donna.webp",
          aspectRatio: "16:9",
          prompt: "A pair of running shoes on a track, no text, letters or logos in the image",
        },
      ],
      sections: { create: [{ position: 0, kind: "INTRO", body: INTRO }] },
    },
  });
  ids.owner = owner.id;
  ids.outsider = outsider.id;
  ids.project = project.id;
  ids.page = plan.pageIds.spoke;
});

test.afterAll(async () => {
  // I workspace personali, il progetto, il piano e l'articolo vanno via in cascata con gli utenti.
  await prisma.user.deleteMany({ where: { id: { in: [ids.owner, ids.outsider] } } });
  await prisma.$disconnect();
});

async function userPage(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  const login = await page.request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(login.status()).toBe(200);
  return page;
}

const editorUrl = () => `/projects/${ids.project}/plan/pages/${ids.page}/article`;

test.describe("editor dell'articolo", () => {
  // covers: AC-4401-4
  test("chi non è nel workspace del progetto riceve 404 e il testo dell'articolo non compare", async ({ browser }) => {
    const page = await userPage(browser, OUTSIDER_EMAIL);

    const response = await page.goto(editorUrl());

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Pagina non trovata" })).toBeVisible();
    expect(await page.content()).not.toContain(INTRO);
  });

  test("il membro del progetto legge l'articolo con il segnaposto immagine, senza violazioni gravi di axe", async ({ browser }) => {
    const page = await userPage(browser, OWNER_EMAIL);

    const response = await page.goto(editorUrl());

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: SPOKE_TITLE })).toBeVisible();
    await expect(page.getByRole("region", { name: "Introduzione" })).toContainText(INTRO);
    await expect(page.getByRole("group", { name: /Segnaposto immagine/ })).toContainText("scarpe-running-donna.webp");
    const results = await new AxeBuilder({ page }).include("main").analyze();
    const serious = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(serious.map((violation) => violation.id)).toEqual([]);
  });
});
