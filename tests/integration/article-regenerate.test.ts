// Gate di T-4002 (AC-4002-4): «Rigenera» (T-2502) porta l'articolo di una pagina in scrittura sulla copia della pagina
// nel nuovo piano, con gli stessi blocchi e lo stesso lavoro.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as generate } from "@/app/api/projects/[id]/strategies/route";
import { prisma } from "@/lib/prisma";
import { memberWithPlan, stubOpenRouterEnv } from "../helpers/ai-titles";
import { saveArticleSettings, startArticle } from "../helpers/articles";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type StartBody = { data: { articleId: string; runId: string } };

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  stubOpenRouterEnv();
  await resetDatabase();
});

describe("articolo e «Rigenera»", () => {
  // covers: AC-4002-4
  it("l'articolo di una pagina in scrittura passa alla copia della pagina nel nuovo piano con gli stessi blocchi", async () => {
    await saveArticleSettings();
    const { owner, member, plan, spoke } = await memberWithPlan("t4002-regen");
    const started = (await (await startArticle(member.cookie, spoke, { length: "LONG" })).json()) as StartBody;
    await prisma.articleSection.createMany({
      data: [
        { article_id: started.data.articleId, position: 0, kind: "INTRO", body: "Introduzione" },
        { article_id: started.data.articleId, position: 1, kind: "H2", heading: "H2 spoke", body: "Primo blocco", edited: true },
      ],
    });
    const sectionsBefore = await prisma.articleSection.findMany({ where: { article_id: started.data.articleId }, orderBy: { position: "asc" } });

    const response = await callRoute(generate, {
      method: "POST",
      url: `/api/projects/${spoke.projectId}/strategies`,
      cookie: owner.cookie,
      params: { id: spoke.projectId },
      body: { mode: "AUTO", regenerate: true },
    });

    expect(response.status).toBe(201);
    const { data } = (await response.json()) as { data: { id: string } };
    expect(data.id).not.toBe(plan.strategyId);
    const copy = await prisma.strategyPage.findFirstOrThrow({ where: { strategy_id: data.id, status: "WRITING" }, select: { id: true, h1: true } });
    expect(copy.h1).toBe("H1 spoke");
    const article = await prisma.article.findUniqueOrThrow({
      where: { id: started.data.articleId },
      include: { sections: { orderBy: { position: "asc" } }, runs: true },
    });
    expect(article.page_id).toBe(copy.id);
    expect(article.sections).toEqual(sectionsBefore);
    expect(article.runs.map((run) => run.id)).toEqual([started.data.runId]);
    expect(await prisma.article.count({ where: { page_id: spoke.pageId } })).toBe(0);
  });
});
