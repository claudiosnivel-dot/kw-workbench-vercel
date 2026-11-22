// Gate di T-7601 (AC-7601-1…4, D-64): Claude Code importa con import_article l'articolo che ha scritto nel sito. Titan
// SEO lo divide nei blocchi di oggi (INTRO, H2, FAQ), lo ripulisce come i blocchi dell'AI, lo salva pronto con source
// AGENT senza lavori né richieste alle AI e risponde con i controlli; la version non lascia sovrascrivere le modifiche
// fatte nell'editor e get_article le restituisce. In più il lavoro dell'AI in corso, il piano precedente, la pagina di
// un altro progetto, la lunghezza dalle parole e i limiti del Markdown.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { patchArticle } from "../helpers/articles";
import { resetDatabase } from "../helpers/db";
import { callTool, rootAdminWithKey } from "../helpers/mcp";
import { insertStrategy } from "../helpers/strategy";

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

type Root = Awaited<ReturnType<typeof rootAdminWithKey>>;

const MAIN = "noleggio magnetoterapia";

/** Pagina pilastro «Da scrivere» con 2 H2 nel piano e uno spoke, nel progetto del root admin. */
async function planPage(root: Root, options: { createdAt?: Date } = {}) {
  const project = await prisma.project.create({ data: { name: "Noleggio magnetoterapia", workspace_id: root.workspaceId } });
  const plan = await insertStrategy({
    projectId: project.id,
    createdAt: options.createdAt,
    pages: [
      { key: "hub", kind: "HUB", keywords: [{ text: MAIN, volume: 900 }], h1: "Noleggio magnetoterapia a casa", h2: ["Come funziona", "Quanto costa"] },
      { key: "spoke", kind: "SPOKE", hub: "hub", keywords: [{ text: "noleggio magnetoterapia prezzi", volume: 90 }] },
    ],
  });
  return { projectId: project.id, strategyId: plan.strategyId, pageId: plan.pageIds.hub, spokeId: plan.pageIds.spoke };
}

type Page = Awaited<ReturnType<typeof planPage>>;

const ARTICLE = [
  "# Noleggio magnetoterapia a casa",
  "",
  `Il ${MAIN} permette di fare la terapia a casa, con un apparecchio consegnato e ritirato dal negozio.`,
  "",
  "## Come funziona",
  "",
  "Si sceglie la durata, si riceve l'apparecchio e si seguono le indicazioni del medico.",
  "",
  "## Quanto costa",
  "",
  "Il prezzo dipende dalla durata del noleggio e dal modello scelto.",
  "",
  "## Domande frequenti",
  "",
  "**Serve la prescrizione?**",
  "",
  "Di solito sì: chiedi al tuo medico prima di iniziare.",
].join("\n");

const META = {
  metaTitle: "Apparecchi a casa: come funziona",
  metaDescription: `Guida al ${MAIN}: come funziona e quanto costa.`,
  slug: "noleggio-magnetoterapia",
};

const importArticle = (root: Root, page: Page, fields: Record<string, unknown> = {}) =>
  callTool(root.key, "import_article", { projectId: page.projectId, pageId: page.pageId, markdown: ARTICLE, ...META, ...fields });

/** Articolo salvato della pagina con i blocchi in ordine. */
const savedArticle = (page: Page) =>
  prisma.article.findUniqueOrThrow({
    where: { page_id: page.pageId },
    include: { sections: { orderBy: { position: "asc" } } },
  });

/** Articolo importato con version 1 e poi modificato dall'utente nell'editor: version 2 con il secondo blocco cambiato. */
async function editedByUser(root: Root, page: Page) {
  expect((await importArticle(root, page)).data).toMatchObject({ version: 1 });
  const article = await savedArticle(page);
  const edited = await patchArticle(root.cookie, page, { version: 1, sections: [{ id: article.sections[1].id, body: "Testo scritto dall'utente nell'editor." }] });
  expect(edited.status).toBe(200);
  return article;
}

describe("import_article", () => {
  // covers: AC-7601-1
  it("su una pagina «Da scrivere» salva l'articolo READY con source AGENT e version 1, i blocchi INTRO, H2, H2, FAQ, la pagina «In scrittura» e risponde con i controlli SEO", async () => {
    const root = await rootAdminWithKey("t7601-import");
    const page = await planPage(root);

    const reply = await importArticle(root, page);

    expect(reply.result?.isError).not.toBe(true);
    const article = await savedArticle(page);
    expect(article).toMatchObject({ status: "READY", source: "AGENT", version: 1, created_by_user_id: root.user.id, length: "SHORT", slug: META.slug });
    expect(article.sections.map((section) => [section.kind, section.heading])).toEqual([
      ["INTRO", null],
      ["H2", "Come funziona"],
      ["H2", "Quanto costa"],
      ["FAQ", "Domande frequenti"],
    ]);
    expect(article.sections[0].body).not.toContain("# Noleggio");
    expect(article.sections.every((section) => section.checks !== null && section.model === null && !section.edited)).toBe(true);
    const pageRow = await prisma.strategyPage.findUniqueOrThrow({ where: { id: page.pageId }, select: { status: true } });
    expect(pageRow.status).toBe("WRITING");
    expect(await prisma.aiRequest.count()).toBe(0);
    expect(await prisma.articleRun.count()).toBe(0);

    expect(reply.data).toMatchObject({ version: 1, source: "AGENT", status: "READY", slug: META.slug });
    expect((reply.data?.blocks as { kind: string }[]).map((block) => block.kind)).toEqual(["INTRO", "H2", "H2", "FAQ"]);
    const checks = reply.data?.checks as { density: number; problems: { rule: string }[] };
    expect(typeof checks.density).toBe("number");
    expect(checks.problems).toContainEqual({ rule: "main_keyword_meta_title" });
    const calls = await prisma.agentCall.findMany({ select: { tool: true, ok: true, project_id: true } });
    expect(calls).toEqual([{ tool: "import_article", ok: true, project_id: page.projectId }]);
  });

  // covers: AC-7601-2
  it("con la version 1 su un articolo che l'utente ha portato alla version 2 è ARTICLE_VERSION_CONFLICT con la version corrente 2 e i blocchi restano quelli dell'utente", async () => {
    const root = await rootAdminWithKey("t7601-conflict");
    const page = await planPage(root);
    await editedByUser(root, page);

    const stale = await importArticle(root, page, { version: 1, markdown: "Testo nuovo di Claude Code.\n\n## Come funziona\n\nAltro testo." });

    expect(stale.result?.isError).toBe(true);
    expect(stale.data).toMatchObject({ code: "ARTICLE_VERSION_CONFLICT", currentVersion: 2 });
    const article = await savedArticle(page);
    expect(article.version).toBe(2);
    expect(article.sections).toHaveLength(4);
    expect(article.sections[1].body).toBe("Testo scritto dall'utente nell'editor.");
    expect(article.sections[1].edited).toBe(true);
  });

  // covers: AC-7601-3
  it("get_article restituisce i blocchi dell'utente con la version 2 e l'importazione con la version 2 riesce con la version 3", async () => {
    const root = await rootAdminWithKey("t7601-merge");
    const page = await planPage(root);
    await editedByUser(root, page);

    const read = await callTool(root.key, "get_article", { projectId: page.projectId, pageId: page.pageId });
    const merged = await importArticle(root, page, { version: 2 });

    expect(read.result?.isError).not.toBe(true);
    expect(read.data).toMatchObject({ version: 2, source: "AGENT", status: "READY", metaTitle: META.metaTitle });
    expect(read.data?.blocks).toEqual([
      expect.objectContaining({ position: 0, kind: "INTRO", heading: null }),
      { position: 1, kind: "H2", heading: "Come funziona", text: "Testo scritto dall'utente nell'editor." },
      expect.objectContaining({ position: 2, kind: "H2", heading: "Quanto costa" }),
      expect.objectContaining({ position: 3, kind: "FAQ", heading: "Domande frequenti" }),
    ]);
    expect(merged.result?.isError).not.toBe(true);
    expect(merged.data).toMatchObject({ version: 3 });
    const article = await savedArticle(page);
    expect(article.version).toBe(3);
    expect(article.sections[1].body).toBe("Si sceglie la durata, si riceve l'apparecchio e si seguono le indicazioni del medico.");
    expect(article.sections[1].edited).toBe(false);
  });

  // covers: AC-7601-4
  it("un Markdown con un tag <script> e un link javascript: si salva senza il tag né il link, come i blocchi dell'AI", async () => {
    const root = await rootAdminWithKey("t7601-sanitize");
    const page = await planPage(root);
    const markdown = [
      `Il ${MAIN} spiegato bene.<script>alert("x")</script>`,
      "",
      "## Come funziona",
      "",
      "Leggi [la guida](javascript:alert(1)) e [lo spoke](page:" + page.spokeId + ").",
    ].join("\n");

    const reply = await importArticle(root, page, { markdown });

    expect(reply.result?.isError).not.toBe(true);
    const bodies = (await savedArticle(page)).sections.map((section) => section.body);
    expect(bodies).toEqual([`Il ${MAIN} spiegato bene.`, `Leggi la guida e [lo spoke](page:${page.spokeId}).`]);
    for (const body of bodies) {
      expect(body).not.toMatch(/<script|alert|javascript:/i);
    }
  });

  it("con un articolo e senza version è ARTICLE_VERSION_CONFLICT con la version corrente", async () => {
    const root = await rootAdminWithKey("t7601-noversion");
    const page = await planPage(root);
    await importArticle(root, page);

    const again = await importArticle(root, page);

    expect(again.data).toMatchObject({ code: "ARTICLE_VERSION_CONFLICT", currentVersion: 1 });
    expect((await savedArticle(page)).version).toBe(1);
  });

  it("con un lavoro dell'AI di Titan SEO in corso sull'articolo è JOB_ALREADY_ACTIVE con il runId e nulla cambia", async () => {
    const root = await rootAdminWithKey("t7601-busy");
    const page = await planPage(root);
    const article = await prisma.article.create({ data: { page_id: page.pageId, project_id: page.projectId, length: "MEDIUM", version: 4 } });
    const run = await prisma.articleRun.create({ data: { article_id: article.id, workspace_id: root.workspaceId, scope: "ARTICLE" } });

    const reply = await importArticle(root, page, { version: 4 });

    expect(reply.result?.isError).toBe(true);
    expect(reply.data).toMatchObject({ code: "JOB_ALREADY_ACTIVE", runId: run.id });
    expect(await prisma.article.findUniqueOrThrow({ where: { id: article.id } })).toMatchObject({ status: "GENERATING", source: "TITAN_AI", version: 4 });
    expect(await prisma.articleSection.count()).toBe(0);
  });

  it("la pagina di un piano precedente è STRATEGY_READ_ONLY, quella di un altro progetto STRATEGY_NOT_FOUND", async () => {
    const root = await rootAdminWithKey("t7601-readonly");
    const old = await planPage(root, { createdAt: new Date("2026-01-01T00:00:00.000Z") });
    await insertStrategy({ projectId: old.projectId, pages: [{ key: "new", kind: "HUB", keywords: [{ text: "magnetoterapia", volume: 500 }] }] });
    const foreign = await prisma.project.create({ data: { name: "Altro", workspace_id: root.workspaceId } });

    const readOnly = await importArticle(root, old);
    const wrongProject = await importArticle(root, { ...old, projectId: foreign.id });

    expect(readOnly.data).toMatchObject({ code: "STRATEGY_READ_ONLY" });
    expect(wrongProject.data).toMatchObject({ code: "STRATEGY_NOT_FOUND" });
    expect(await prisma.article.count()).toBe(0);
  });

  it("la lunghezza viene dalle parole, una sezione vuota o più di 40 blocchi sono VALIDATION_ERROR e get_article senza articolo è ARTICLE_NOT_FOUND", async () => {
    const root = await rootAdminWithKey("t7601-limits");
    const page = await planPage(root);
    const missing = await callTool(root.key, "get_article", { projectId: page.projectId, pageId: page.pageId });
    const empty = await importArticle(root, page, { markdown: "Introduzione.\n\n## Come funziona\n\n<img src=x>" });
    const many = await importArticle(root, page, { markdown: Array.from({ length: 41 }, (_, index) => `## Sezione ${index + 1}\n\nTesto ${index + 1}.`).join("\n\n") });
    const words = Array.from({ length: 1600 }, (_, index) => `parola${index}`).join(" ");
    const long = await importArticle(root, page, { markdown: `${words}\n\n## Come funziona\n\nTesto.` });

    expect(missing.data).toMatchObject({ code: "ARTICLE_NOT_FOUND" });
    expect(empty.data).toMatchObject({ code: "VALIDATION_ERROR", field: "markdown", heading: "Come funziona" });
    expect(many.data).toMatchObject({ code: "VALIDATION_ERROR", field: "markdown" });
    expect(long.result?.isError).not.toBe(true);
    expect(long.data).toMatchObject({ length: "LONG", version: 1 });
  });
});
