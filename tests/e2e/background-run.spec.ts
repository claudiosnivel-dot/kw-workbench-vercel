import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security/password";

// Utente dedicato: il progetto e i job di questo file non compaiono nelle pagine fotografate dall'utente seed.
// La password è un valore di test, mai una credenziale reale.
const USERNAME = "e2e-background-run";
const PASSWORD = "e2e-background-password-not-real";

let userId = "";
let projectId = "";
let firstSectionId = "";
let secondSectionId = "";
let runningJobId = "";

test.beforeAll(async () => {
  const user = await prisma.user.create({ data: { username: USERNAME, password_hash: await hashPassword(PASSWORD) } });
  userId = user.id;
  await prisma.userOnboardingProgress.create({
    data: { user_id: user.id, status: "COMPLETED", current_step: "REVIEW_EXPORT", completed_at: new Date() },
  });
  const project = await prisma.project.create({
    data: {
      name: "Estrazione in background",
      owner_user_id: user.id,
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
  test("l'avanzamento sopravvive al ricaricamento e una nuova estrazione arriva ai risultati", async ({ page }) => {
    test.setTimeout(120_000);
    const login = await page.request.post("/api/auth/login", { data: { username: USERNAME, password: PASSWORD } });
    expect(login.status()).toBe(200);

    await page.goto(`/projects/${projectId}?sectionId=${firstSectionId}`);
    await page.reload();
    await expect(page.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow", "3");

    await prisma.job.update({
      where: { id: runningJobId },
      data: { status: "completed", phase: "done", progress_done: 10, completed_at: new Date() },
    });
    await expect(page.getByRole("link", { name: "Vedi risultati" }).first()).toBeVisible({ timeout: 5_000 });

    await page.goto(`/projects/${projectId}?sectionId=${secondSectionId}`);
    await page.getByRole("button", { name: "Avvia estrazione (sezione attiva)" }).click();
    const results = page.getByRole("link", { name: "Vedi risultati" }).first();
    await expect(results).toBeVisible({ timeout: 60_000 });

    await results.click();
    await page.waitForURL((url) => url.pathname === `/projects/${projectId}/results`);
    await expect(page.locator("tbody tr").filter({ hasText: "caffe moka" }).first()).toBeVisible();
  });
});
