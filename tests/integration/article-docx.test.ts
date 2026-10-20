// Gate di T-4502 (AC-4502-1): il file Word dell'articolo ha l'H1 come titolo, l'H2 come intestazione, le voci
// dell'elenco e l'indirizzo del link interno risolto.
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { memberWithPlan } from "../helpers/ai-titles";
import { exportArticle, insertReadyArticle } from "../helpers/articles";
import { resetDatabase } from "../helpers/db";
import { unzip } from "../helpers/zip";

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

beforeEach(async () => {
  await resetDatabase();
});

/** Paragrafi di word/document.xml con lo stile, il testo e l'eventuale numerazione (elenchi). */
function paragraphs(xml: string) {
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(([paragraph]) => ({
    style: /<w:pStyle w:val="([^"]+)"\/>/.exec(paragraph)?.[1] ?? null,
    text: [...paragraph.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((match) => match[1]).join(""),
    listed: paragraph.includes("<w:numPr>"),
  }));
}

describe("file Word dell'articolo", () => {
  // covers: AC-4502-1
  it("il MEMBER riceve il .docx con l'H1, l'H2 come intestazione, le voci dell'elenco e l'URL del link", async () => {
    const { member, plan, spoke } = await memberWithPlan(`t4502-docx-${randomUUID().slice(0, 8)}`);
    await prisma.strategyPage.update({ where: { id: plan.pageIds.hub }, data: { published_url: "https://www.esempio.it/scarpe-running/" } });
    await insertReadyArticle(spoke, {
      slug: "scarpe-running-donna",
      sections: [
        { kind: "INTRO", body: `Parti dalla [guida alle scarpe](page:${plan.pageIds.hub}).` },
        { kind: "H2", heading: "Come scegliere la taglia", body: "Controlla due cose:\n\n- la **lunghezza** del piede\n- la *larghezza* della pianta" },
      ],
    });
    const h1 = (await prisma.strategyPage.findUniqueOrThrow({ where: { id: spoke.pageId }, select: { h1: true } })).h1;

    const response = await exportArticle(member.cookie, spoke, "docx");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="scarpe-running-donna.docx"');
    const files = unzip(Buffer.from(await response.arrayBuffer()));
    const document = paragraphs(files.get("word/document.xml") ?? "");
    expect(document[0]).toEqual({ style: "Title", text: h1, listed: false });
    expect(document).toContainEqual({ style: "Heading2", text: "Come scegliere la taglia", listed: false });
    expect(document.filter((paragraph) => paragraph.listed).map((paragraph) => paragraph.text)).toEqual([
      "la lunghezza del piede",
      "la larghezza della pianta",
    ]);
    expect(document).toContainEqual({ style: null, text: "Parti dalla guida alle scarpe.", listed: false });
    expect(files.get("word/_rels/document.xml.rels")).toContain('Target="https://www.esempio.it/scarpe-running/"');
    expect(files.get("word/document.xml")).not.toContain("ld+json");
  });
});
