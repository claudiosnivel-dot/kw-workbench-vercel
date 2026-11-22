// Prova del DoD di T-7102 a 390 px di larghezza: il root admin crea la chiave di Claude Code dalla card «Claude Code»
// delle impostazioni; chiave e comando vanno a capo senza scorrimento orizzontale, i pulsanti sono alti almeno 44 px e
// axe non trova violazioni gravi nella card; ricaricando resta solo il prefisso, «Revoca» con la conferma la spegne.
// impacted-by: T-7602 (dopo il ricaricamento la card elenca tre chiamate di Claude Code, una con un nome di progetto
// lungo e una d'errore, che vanno a capo a 390 px senza scorrimento orizzontale)
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { E2E_EMAIL, E2E_USER_PASSWORD } from "./credentials";

const WIDTH = 390;

test.use({ viewport: { width: WIDTH, height: 844 }, reducedMotion: "reduce" });

// Il root admin è l'utente seed: le sue chiavi si tolgono prima e dopo, così nessun'altra prova le vede.
async function removeKeys() {
  await prisma.agentKey.deleteMany({ where: { user: { email: E2E_EMAIL } } });
}

test.beforeAll(removeKeys);

test.afterAll(async () => {
  await removeKeys();
  await prisma.$disconnect();
});

async function expectFits(page: Page, element: Locator) {
  const box = (await element.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(WIDTH);
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

test("a 390 px il root admin crea la chiave, la vede una volta sola e la revoca", async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { email: E2E_EMAIL, password: E2E_USER_PASSWORD } });
  expect(login.status()).toBe(200);

  await page.goto("/admin/settings");
  const card = page.locator("section", { has: page.getByTestId("admin-agent-key-card") });
  await expect(card.getByRole("heading", { name: "Claude Code" })).toBeVisible();
  await expect(card.getByText("Nessuna chiave attiva")).toBeVisible();
  await expect(card.getByLabel("Durata della chiave")).toHaveValue("90");

  await card.getByRole("button", { name: "Crea la chiave" }).click();
  const key = card.getByLabel("La tua chiave");
  await expect(key).toHaveValue(/^tsk_[A-Za-z0-9_-]{43}$/);
  const value = await key.inputValue();
  await expect(card.getByLabel("Comando per collegare Claude Code")).toHaveValue(
    new RegExp(`^claude mcp add --transport http titanseo https?://[^ ]+/api/mcp --header "Authorization: Bearer ${value}"$`)
  );
  await card.scrollIntoViewIfNeeded();
  await expectFits(page, card);
  await expectTallButtons(card);
  expect(await seriousViolations(page, "[data-testid=admin-agent-key-card]")).toEqual([]);

  // Chiamate di Claude Code della chiave appena creata: un progetto con il nome lungo, un esito d'errore, nessun progetto.
  const created = await prisma.agentKey.findFirstOrThrow({ where: { user: { email: E2E_EMAIL } }, select: { id: true, user_id: true } });
  const workspace = await prisma.membership.findFirstOrThrow({ where: { user_id: created.user_id }, select: { workspace_id: true } });
  const project = await prisma.project.create({
    data: { name: "Noleggio magnetoterapia a domicilio con consegna e ritiro in tutta la provincia", workspace_id: workspace.workspace_id },
  });
  await prisma.agentCall.createMany({
    data: [
      { key_id: created.id, tool: "list_projects", ok: true, duration_ms: 40 },
      { key_id: created.id, tool: "build_plan", project_id: project.id, ok: true, duration_ms: 2450 },
      { key_id: created.id, tool: "edit_plan", project_id: project.id, ok: false, error_code: "AGENT_PAGE_LOCKED", duration_ms: 180 },
    ],
  });

  await page.reload();
  const activity = card.getByTestId("agent-activity");
  await expect(activity.getByRole("listitem")).toHaveCount(3);
  await expect(activity.getByText("Errore: AGENT_PAGE_LOCKED")).toBeVisible();
  await activity.scrollIntoViewIfNeeded();
  await expectFits(page, activity);
  await prisma.project.delete({ where: { id: project.id } });
  await expect(card.getByText(`Chiave: tsk_${value.slice(4, 12)}…`)).toBeVisible();
  await expect(card.getByText("Mai usata")).toBeVisible();
  await expect(card.getByLabel("La tua chiave")).toHaveCount(0);
  expect(await page.content()).not.toContain(value.slice(4));

  await card.getByRole("button", { name: "Revoca" }).click();
  const dialog = page.getByRole("dialog", { name: "Revocare la chiave?" });
  await expectFits(page, dialog);
  await expectTallButtons(dialog);
  await dialog.getByRole("button", { name: "Revoca la chiave" }).click();
  await expect(card.getByText("Nessuna chiave attiva")).toBeVisible();
  await expect(dialog).toHaveCount(0);
});
