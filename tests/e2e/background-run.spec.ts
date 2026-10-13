// Gate di T-1205 (AC-1205-4): l'avanzamento di una ricerca sopravvive al ricaricamento e una nuova ricerca arriva
// all'elenco delle keyword.
// impacted-by: T-2404 (la ricerca si segue nel riquadro della pagina dell'argomento, che a fine ricerca si aggiorna da
// sola, e si avvia dalla barra del prossimo passo e da «Trova altre keyword» invece che dalla vecchia pagina del
// progetto: AC-1205-4 emendato)
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createE2EUser } from "./credentials";

// Utente dedicato: il progetto e i job di questo file non compaiono nelle pagine fotografate dall'utente seed.
// Password generata a ogni esecuzione, mai una credenziale reale.
const EMAIL = "e2e-background-run@example.test";
const PASSWORD = randomBytes(18).toString("hex");

let userId = "";
let projectId = "";
let firstSectionId = "";
let secondSectionId = "";
let runningJobId = "";

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await createE2EUser(EMAIL, PASSWORD);
  userId = user.id;
  const project = await prisma.project.create({
    data: {
      name: "Estrazione in background",
      workspace_id: user.workspaceId,
      language_code: "it",
      country_code: "IT",
      autocomplete_provider: "MOCK",
      metrics_provider: "MOCK",
      expand_alpha: false,
      expand_numeric: false,
      expand_patterns: false,
    },
  });
  projectId = project.id;
  const first = await prisma.subproject.create({ data: { project_id: project.id, name: "Prima", position: 0 } });
  const second = await prisma.subproject.create({ data: { project_id: project.id, name: "Seconda", position: 1 } });
  firstSectionId = first.id;
  secondSectionId = second.id;
  await prisma.project.update({ where: { id: project.id }, data: { default_subproject_id: first.id } });
  await prisma.seed.createMany({
    data: [first.id, second.id].map((sectionId) => ({ project_id: project.id, subproject_id: sectionId, keyword: "caffe moka" })),
  });
  // Job già in corso sulla prima sezione, come lasciato da un'altra scheda: heartbeat recente, nessun recupero.
  const job = await prisma.job.create({
    data: {
      project_id: project.id,
      subproject_id: first.id,
      status: "running",
      phase: "autocomplete",
      progress_done: 3,
      progress_total: 10,
      heartbeat_at: new Date(),
    },
  });
  runningJobId = job.id;
});

test.afterAll(async () => {
  // Progetti, sezioni e job vanno via in cascata con l'utente.
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

test.describe("estrazione in background", () => {
  // covers: AC-1205-4
  test("l'avanzamento sopravvive al ricaricamento e le nuove ricerche arrivano all'elenco delle keyword", async ({ page }) => {
    test.setTimeout(180_000);
    const login = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
    expect(login.status()).toBe(200);
    const searchBox = page.getByRole("region", { name: "Sto cercando le keyword…" });
    const keptRow = page.getByRole("table", { name: "Keyword tenute" }).getByRole("row").filter({ hasText: "caffe moka" });

    await page.goto(`/projects/${projectId}`);
    await page.waitForURL((url) => url.pathname === `/projects/${projectId}/keywords/${firstSectionId}`);
    await page.reload();
    await expect(searchBox.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");

    await prisma.job.update({
      where: { id: runningJobId },
      data: { status: "completed", phase: "done", progress_done: 10, completed_at: new Date() },
    });
    await expect(searchBox).toBeHidden({ timeout: 5_000 });

    // Dalla barra del prossimo passo: nessuna keyword tenuta, la ricerca riparte sul primo argomento con le seed.
    await page.getByRole("region", { name: "Prossimo passo" }).getByRole("button", { name: "Avvia la ricerca" }).click();
    await expect(keptRow.first()).toBeVisible({ timeout: 60_000 });

    // Da «Trova altre keyword» sul secondo argomento: salva le parole di partenza e cerca.
    await page.goto(`/projects/${projectId}/keywords/${secondSectionId}`);
    await page.getByRole("button", { name: "+ Trova altre keyword" }).click();
    await page.getByRole("dialog", { name: "Parole di partenza" }).getByRole("button", { name: "Salva e cerca" }).click();
    await expect(keptRow.first()).toBeVisible({ timeout: 60_000 });
  });
});
