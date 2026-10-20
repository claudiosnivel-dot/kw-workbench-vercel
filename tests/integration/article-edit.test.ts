// Gate di T-4402 (AC-4402-1, AC-4402-2): la PATCH dell'articolo salva il testo di un blocco ripulito con la version
// corrente e risponde 409 ARTICLE_VERSION_CONFLICT con una version superata; «Riscrivi questo blocco» oltre il limite
// del workspace risponde 429 senza lavori nuovi, mentre il root admin avvia la riscrittura con scope SECTION. In più i
// controlli ricalcolati senza il modello, meta e slug con i loro limiti, un lavoro attivo, l'istruzione della
// riscrittura e il blocco riscritto che torna edited false.
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@/lib/generated/prisma/enums";
import { advanceArticleRun } from "@/lib/articles/run";
import { prisma } from "@/lib/prisma";
import { memberWithPlan, stubOpenRouterEnv } from "../helpers/ai-titles";
import {
  articleCompletion,
  modelReply,
  patchArticle,
  rewriteSection,
  saveArticleSettings,
  type SentSectionData,
  sentData,
  startArticle,
} from "../helpers/articles";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const fetchMock = vi.fn<typeof fetch>();
const STEP_MS = 270_000;

type ErrorBody = { code?: string };
type ArticleBody = { data: { version: number; sections: { id: string; body: string; edited: boolean; checks: unknown }[]; seoReport: unknown } };

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  // app_settings è cifrata: una chiave casuale di test.
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  stubOpenRouterEnv();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url, init) => articleCompletion(init));
  vi.stubGlobal("fetch", fetchMock);
  await resetDatabase();
  return () => vi.unstubAllGlobals();
});

/** Articolo pronto di uno spoke con un H2, scritto dal lavoro con le risposte simulate del modello. */
async function readyArticle(label: string) {
  const setup = await memberWithPlan(label);
  await prisma.strategyPage.update({ where: { id: setup.spoke.pageId }, data: { h2: ["Come scegliere la taglia"] } });
  const response = await startArticle(setup.member.cookie, setup.spoke, { length: "MEDIUM" });
  expect(response.status).toBe(202);
  const { data } = (await response.json()) as { data: { articleId: string; runId: string } };
  expect(await advanceArticleRun(data.runId, Date.now() + STEP_MS)).toMatchObject({ status: "completed" });
  const sections = await prisma.articleSection.findMany({ where: { article_id: data.articleId }, orderBy: { position: "asc" } });
  return { ...setup, articleId: data.articleId, sections };
}

const errorCode = async (response: Response) => ((await response.clone().json()) as ErrorBody).code;

const sectionRuns = (articleId: string) => prisma.articleRun.findMany({ where: { article_id: articleId, scope: "SECTION" } });

describe("modifica dell'articolo", () => {
  // covers: AC-4402-1
  it("con version 3 salva il blocco ripulito, risponde version 4 e il blocco è edited; la stessa version di nuovo è 409", async () => {
    await saveArticleSettings();
    const { member, spoke, articleId, sections } = await readyArticle("t4402-a");
    await prisma.article.update({ where: { id: articleId }, data: { version: 3 } });
    const block = sections[1];
    const fetchesBefore = fetchMock.mock.calls.length;

    const first = await patchArticle(member.cookie, spoke, { version: 3, sections: [{ id: block.id, body: "<b>x</b> testo **grassetto**" }] });
    const second = await patchArticle(member.cookie, spoke, { version: 3, sections: [{ id: block.id, body: "Altro testo" }] });

    expect(first.status).toBe(200);
    expect(((await first.json()) as ArticleBody).data.version).toBe(4);
    const saved = await prisma.articleSection.findUniqueOrThrow({ where: { id: block.id } });
    expect(saved.body).not.toContain("<b>");
    expect(saved.body).toContain("**grassetto**");
    expect(saved.edited).toBe(true);
    expect(second.status).toBe(409);
    expect(await errorCode(second)).toBe("ARTICLE_VERSION_CONFLICT");
    expect((await prisma.articleSection.findUniqueOrThrow({ where: { id: block.id } })).body).toBe(saved.body);
    expect(fetchMock.mock.calls.length).toBe(fetchesBefore);
  });

  it("i controlli del blocco e il rapporto SEO si ricalcolano senza il modello", async () => {
    await saveArticleSettings();
    const { member, spoke, articleId, sections } = await readyArticle("t4402-checks");
    const version = (await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).version;
    const fetchesBefore = fetchMock.mock.calls.length;

    const response = await patchArticle(member.cookie, spoke, {
      version,
      sections: [{ id: sections[1].id, body: "In conclusione, la taglia costa 120 euro." }],
    });

    expect(response.status).toBe(200);
    const block = await prisma.articleSection.findUniqueOrThrow({ where: { id: sections[1].id } });
    const checks = block.checks as { matches: { kind: string; rule: string }[]; rewritten: boolean };
    expect(checks.matches).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "ai_pattern", rule: "phrase" }), expect.objectContaining({ kind: "to_verify" })])
    );
    expect(checks.rewritten).toBe(false);
    const report = (await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).seo_report as { blocks: { position: number }[] };
    expect(report).toHaveProperty("density");
    expect(fetchMock.mock.calls.length).toBe(fetchesBefore);
  });

  it("meta title, meta description e slug si salvano entro i limiti; oltre i limiti o con campi in più è 400", async () => {
    await saveArticleSettings();
    const { member, spoke, articleId } = await readyArticle("t4402-meta");
    const version = (await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).version;

    const tooLong = await patchArticle(member.cookie, spoke, { version, meta_title: "x".repeat(61) });
    const badSlug = await patchArticle(member.cookie, spoke, { version, slug: "Scarpe Running!" });
    const extra = await patchArticle(member.cookie, spoke, { version, project_id: "altro" });
    const saved = await patchArticle(member.cookie, spoke, {
      version,
      meta_title: "Scarpe running donna",
      meta_description: "Come scegliere le scarpe running da donna.",
      slug: "scarpe-running-donna-guida",
    });

    for (const response of [tooLong, badSlug, extra]) {
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("VALIDATION_ERROR");
    }
    expect(saved.status).toBe(200);
    expect(await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).toMatchObject({
      meta_title: "Scarpe running donna",
      meta_description: "Come scegliere le scarpe running da donna.",
      slug: "scarpe-running-donna-guida",
      version: version + 1,
    });
  });

  it("con un lavoro attivo sull'articolo la modifica è 409 JOB_ALREADY_ACTIVE", async () => {
    await saveArticleSettings();
    const { member, spoke, articleId, sections } = await readyArticle("t4402-active");
    expect((await rewriteSection(member.cookie, spoke, sections[1].id)).status).toBe(202);
    const version = (await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).version;

    const response = await patchArticle(member.cookie, spoke, { version, sections: [{ id: sections[1].id, body: "Nuovo testo" }] });

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe("JOB_ALREADY_ACTIVE");
  });
});

describe("riscrittura di un blocco", () => {
  // covers: AC-4402-2
  it("oltre il limite del workspace il MEMBER riceve 429 senza lavori nuovi, il root admin 202 con un lavoro SECTION", async () => {
    await saveArticleSettings({ sectionRewritesPerWorkspaceDaily: 1 });
    const { owner, member, spoke, articleId, sections } = await readyArticle("t4402-limit");
    const root = await createUserWithSession({ displayName: `t4402-root-${randomUUID().slice(0, 8)}`, role: UserRole.ADMIN, isRootAdmin: true });
    await prisma.membership.create({ data: { workspace_id: owner.workspaceId, user_id: root.user.id, role: "MEMBER" } });
    // La riscrittura già fatta oggi nel workspace.
    const earlier = await rewriteSection(member.cookie, spoke, sections[1].id);
    expect(earlier.status).toBe(202);
    const { data: earlierRun } = (await earlier.json()) as { data: { runId: string } };
    expect(await advanceArticleRun(earlierRun.runId, Date.now() + STEP_MS)).toMatchObject({ status: "completed" });

    const byMember = await rewriteSection(member.cookie, spoke, sections[1].id, { instruction: "Più breve" });
    const runsAfterMember = await sectionRuns(articleId);
    const byRoot = await rewriteSection(root.cookie, spoke, sections[1].id);

    expect(byMember.status).toBe(429);
    expect(await errorCode(byMember)).toBe("RATE_LIMITED");
    expect(runsAfterMember).toHaveLength(1);
    expect(byRoot.status).toBe(202);
    const { data } = (await byRoot.json()) as { data: { runId: string } };
    expect(await prisma.articleRun.findUniqueOrThrow({ where: { id: data.runId } })).toMatchObject({
      scope: "SECTION",
      section_id: sections[1].id,
      status: "pending",
      phase: "sections",
    });
  });

  it("l'istruzione arriva al modello e il blocco riscritto torna edited false; un secondo avvio insieme è 409", async () => {
    await saveArticleSettings();
    const { member, spoke, articleId, sections } = await readyArticle("t4402-rewrite");
    const version = (await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).version;
    expect((await patchArticle(member.cookie, spoke, { version, sections: [{ id: sections[1].id, body: "Testo mio" }] })).status).toBe(200);
    fetchMock.mockImplementation(async (_url, init) => {
      const data = sentData<Partial<SentSectionData>>(init);
      return data.block?.id === "H2_1" ? modelReply("Chi sceglie la taglia giusta corre meglio e senza dolori.") : articleCompletion(init);
    });

    const started = await rewriteSection(member.cookie, spoke, sections[1].id, { instruction: "Più breve e pratico" });
    const again = await rewriteSection(member.cookie, spoke, sections[1].id);
    expect(started.status).toBe(202);
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe("JOB_ALREADY_ACTIVE");
    const { data } = (await started.json()) as { data: { runId: string } };
    expect(await advanceArticleRun(data.runId, Date.now() + STEP_MS)).toMatchObject({ status: "completed" });

    const sent = fetchMock.mock.calls.map(([, init]) => sentData<Partial<SentSectionData>>(init)).filter((item) => item.block?.id === "H2_1");
    expect(sent.at(-1)?.instruction).toBe("Più breve e pratico");
    expect(await prisma.articleSection.findUniqueOrThrow({ where: { id: sections[1].id } })).toMatchObject({
      body: "Chi sceglie la taglia giusta corre meglio e senza dolori.",
      edited: false,
    });
    expect((await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).version).toBe(version + 2);
  });

  it("un'istruzione oltre 500 caratteri è 400 e un blocco di un altro articolo è 404", async () => {
    await saveArticleSettings();
    const { member, spoke, sections } = await readyArticle("t4402-input");
    const other = await readyArticle("t4402-other");

    const tooLong = await rewriteSection(member.cookie, spoke, sections[1].id, { instruction: "x".repeat(501) });
    const foreign = await rewriteSection(member.cookie, spoke, other.sections[1].id);

    expect(tooLong.status).toBe(400);
    expect(await errorCode(tooLong)).toBe("VALIDATION_ERROR");
    expect(foreign.status).toBe(404);
    expect(await errorCode(foreign)).toBe("ARTICLE_NOT_FOUND");
  });
});
