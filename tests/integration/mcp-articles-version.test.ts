// Gate di T-8202 (AC-8202-1, D-70): import_article vuole sempre la version letta, anche alla prima importazione. Senza
// version è VALIDATION_ERROR sul campo version; senza articolo la version è 0, e una diversa è ARTICLE_VERSION_CONFLICT
// con currentVersion 0 senza creare l'articolo; con la version 0 l'articolo nasce con la version 1.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
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

const MAIN = "noleggio magnetoterapia";

const ARTICLE = [
  `Il ${MAIN} permette di fare la terapia a casa.`,
  "",
  "## Come funziona",
  "",
  "Si sceglie la durata e si riceve l'apparecchio.",
].join("\n");

describe("import_article con la version sempre obbligatoria", () => {
  // covers: AC-8202-1
  it("su una pagina senza articolo: senza version VALIDATION_ERROR, con la version 3 ARTICLE_VERSION_CONFLICT con currentVersion 0, con la version 0 l'articolo nasce con la version 1", async () => {
    const root = await rootAdminWithKey("t8202-version");
    const project = await prisma.project.create({ data: { name: "Noleggio magnetoterapia", workspace_id: root.workspaceId } });
    const plan = await insertStrategy({
      projectId: project.id,
      pages: [{ key: "hub", kind: "HUB", keywords: [{ text: MAIN, volume: 900 }], h1: "Noleggio magnetoterapia a casa", h2: ["Come funziona"] }],
    });
    const fields = {
      projectId: project.id,
      pageId: plan.pageIds.hub,
      markdown: ARTICLE,
      metaTitle: "Noleggio magnetoterapia a casa",
      metaDescription: `Guida al ${MAIN}: come funziona.`,
      slug: "noleggio-magnetoterapia",
    };

    const missing = await callTool(root.key, "import_article", fields);
    const wrong = await callTool(root.key, "import_article", { ...fields, version: 3 });
    const articlesAfterRejected = await prisma.article.count({ where: { page_id: plan.pageIds.hub } });
    const created = await callTool(root.key, "import_article", { ...fields, version: 0 });

    expect(missing.result?.isError).toBe(true);
    expect(missing.data).toMatchObject({ code: "VALIDATION_ERROR", field: "version" });
    expect(wrong.result?.isError).toBe(true);
    expect(wrong.data).toMatchObject({ code: "ARTICLE_VERSION_CONFLICT", currentVersion: 0 });
    expect(articlesAfterRejected).toBe(0);
    expect(created.result?.isError).not.toBe(true);
    expect(created.data).toMatchObject({ version: 1, source: "AGENT", status: "READY" });
    const article = await prisma.article.findUniqueOrThrow({ where: { page_id: plan.pageIds.hub }, select: { version: true } });
    expect(article.version).toBe(1);
  });
});
