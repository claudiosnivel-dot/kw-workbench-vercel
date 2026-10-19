// Gate di T-4902 (AC-4902-2, AC-4902-3): lo spagnolo si sceglie dalle preferenze e le pagine di lavoro dell'app, con
// utenti es-ES ed es-419, non mostrano chiavi del catalogo né testi del catalogo inglese di ripiego.
import { randomBytes } from "node:crypto";
import { expect, type Locator, type Page, test } from "@playwright/test";
import type { UiLocale } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import en from "@/messages/en.json";
import es419 from "@/messages/es-419.json";
import esES from "@/messages/es-ES.json";
import it from "@/messages/it.json";
import { insertStrategy } from "../helpers/strategy";
import { createE2EUser } from "./credentials";

// Utenti dedicati: nulla compare nelle pagine fotografate dall'utente seed. Password generata a ogni esecuzione.
const PASSWORD = randomBytes(18).toString("hex");
const PREFERENCE_EMAIL = "e2e-es-preference@example.test";
const SPAIN_EMAIL = "e2e-es-spain@example.test";
const LATAM_EMAIL = "e2e-es-latam@example.test";
const EMAILS = [PREFERENCE_EMAIL, SPAIN_EMAIL, LATAM_EMAIL];
const userIds: string[] = [];
const projects: Record<string, { id: string; topicId: string }> = {};

type Catalog = { [key: string]: string | Catalog };

function messagesOf(catalog: Catalog, prefix = ""): [string, string][] {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [[path, value] as [string, string]] : messagesOf(value, path);
  });
}

const CATALOG_KEYS = new Set(messagesOf(it as Catalog).map(([key]) => key));
// Testi che anche lo spagnolo usa uguali (nomi di lingue e di prodotti, sigle): non sono un ripiego sull'inglese.
const SPANISH_TEXTS = new Set([...messagesOf(esES as Catalog), ...messagesOf(es419 as Catalog)].map(([, message]) => message));
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Riconoscitori dei testi del catalogo inglese che lo spagnolo non usa: riga uguale al messaggio, con gli argomenti
 * semplici ({name}) al posto di qualunque testo. I messaggi con plural, select o tag e quelli con meno di una parola di
 * tre lettere fuori dagli argomenti non si cercano: riconoscerebbero anche righe spagnole.
 */
const ENGLISH_FALLBACKS: { key: string; pattern: RegExp }[] = messagesOf(en as Catalog)
  .filter(([, message]) => !SPANISH_TEXTS.has(message))
  .filter(([, message]) => !/[<]|,\s*(plural|select|selectordinal)\s*,/.test(message))
  .filter(([, message]) => /\p{L}{3,}/u.test(message.replace(/\{[^}]*\}/g, " ")))
  .map(([key, message]) => ({
    key,
    pattern: new RegExp(`^${message.split(/\{[^}]*\}/).map(escapeRegExp).join(".+")}$`, "u"),
  }));

/** Righe di testo visibile della pagina che sono una chiave del catalogo o un testo inglese di ripiego. */
async function untranslatedLines(page: Page): Promise<string[]> {
  const lines = (await page.locator("body").innerText())
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.flatMap((line) => {
    const keys = line.split(/\s+/).filter((token) => CATALOG_KEYS.has(token));
    const fallback = ENGLISH_FALLBACKS.find(({ pattern }) => pattern.test(line));
    return [...keys.map((key) => `chiave ${key}: ${line}`), ...(fallback ? [`inglese ${fallback.key}: ${line}`] : [])];
  });
}

/** Progetto con un tema, tre palabras clave conservate e un piano di tre pagine, come dopo una ricerca. */
async function projectWithPlan(user: { id: string; workspaceId: string }, name: string) {
  const project = await prisma.project.create({
    data: { name, workspace_id: user.workspaceId, created_by_user_id: user.id, language_code: "es", country_code: "ES" },
  });
  const topic = await prisma.subproject.create({ data: { project_id: project.id, name: "Zapatillas running", position: 0 } });
  await prisma.project.update({ where: { id: project.id }, data: { default_subproject_id: topic.id } });
  await prisma.seed.create({ data: { project_id: project.id, subproject_id: topic.id, keyword: "zapatillas running" } });
  const keywords = ["zapatillas running", "zapatillas running mujer", "mejores zapatillas running"];
  await prisma.keywordCandidate.createMany({
    data: keywords.map((keyword, index) => ({
      project_id: project.id,
      subproject_id: topic.id,
      keyword,
      normalized_keyword: keyword,
      canonical_keyword: keyword,
      source: "MOCK",
      source_query: keyword,
      avg_monthly_searches: 1000 - index * 100,
    })),
  });
  await insertStrategy({
    projectId: project.id,
    pages: keywords.map((keyword, index) => ({
      key: `p${index}`,
      kind: index === 0 ? ("HUB" as const) : ("SPOKE" as const),
      hub: index === 0 ? undefined : "p0",
      keywords: [{ text: keyword, volume: 1000 - index * 100 }],
    })),
  });
  return { id: project.id, topicId: topic.id };
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  const locales: (UiLocale | null)[] = [null, "es_ES", "es_419"];
  const users = await Promise.all(EMAILS.map((email, index) => createE2EUser(email, PASSWORD, { ui_locale: locales[index] })));
  userIds.push(...users.map((user) => user.id));
  projects[SPAIN_EMAIL] = await projectWithPlan(users[1], "Tienda de running");
  projects[LATAM_EMAIL] = await projectWithPlan(users[2], "Tienda de running");
});

test.afterAll(async () => {
  // Il workspace personale, i progetti e i piani vanno via in cascata con l'utente.
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

async function login(page: Page, email: string): Promise<void> {
  const response = await page.request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(response.status()).toBe(200);
}

// covers: AC-4902-2
test("PATCH delle preferenze con es-419 risponde 200 e la home mostra «Buscar palabras clave»", async ({ page }) => {
  await login(page, PREFERENCE_EMAIL);

  const response = await page.request.patch("/api/user/preferences", { data: { uiLocale: "es-419" } });
  expect(response.status()).toBe(200);
  expect((await response.json()).data.uiLocale).toBe("es-419");

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "es-419");
  await expect(page.getByRole("button", { name: "Buscar palabras clave" })).toBeVisible();
});

for (const [email, lang] of [
  [SPAIN_EMAIL, "es-ES"],
  [LATAM_EMAIL, "es-419"],
] as const) {
  // covers: AC-4902-3
  test(`con la lingua ${lang} home, keyword, piano e impostazioni non mostrano chiavi né testi inglesi di ripiego`, async ({ page }) => {
    await login(page, email);
    const { id, topicId } = projects[email];
    // Pagina e un dato che deve comparire, così il controllo guarda la pagina con le palabras clave e il piano.
    const pages: [string, (page: Page) => Locator][] = [
      ["/", (page) => page.getByText("Tienda de running").first()],
      [`/projects/${id}/keywords`, (page) => page.getByText("zapatillas running mujer").first()],
      [`/projects/${id}/keywords/${topicId}`, (page) => page.getByText("zapatillas running mujer").first()],
      [`/projects/${id}/plan`, (page) => page.getByTestId("plan-column").first()],
      [`/projects/${id}/settings`, (page) => page.getByRole("heading", { level: 1 })],
    ];

    for (const [path, data] of pages) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator("html"), path).toHaveAttribute("lang", lang);
      await expect(data(page), path).toBeVisible();
      await page.waitForLoadState("networkidle");

      expect(await untranslatedLines(page), path).toEqual([]);
    }
  });
}
