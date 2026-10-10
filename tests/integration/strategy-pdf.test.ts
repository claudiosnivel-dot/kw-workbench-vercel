// Gate di T-1907 (AC-1907-1…3): PDF della strategia generato dal server, con le spiegazioni nella lingua scelta, gli
// H1 nella lingua del progetto e i testi dell'utente resi come testo. Il testo si estrae con unpdf (sola lettura).
import { randomUUID } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportStrategy } from "@/app/api/projects/[id]/strategies/[strategyId]/export/route";
import { prisma } from "@/lib/prisma";
import en from "@/messages/en.json";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { insertStrategy, type PlanPageSpec } from "../helpers/strategy";

const TWO_HUBS: PlanPageSpec[] = [
  { key: "a", kind: "HUB", h1: "Scarpe running: la guida pratica", keywords: [{ text: "scarpe running", volume: 9900 }] },
  {
    key: "a1",
    kind: "SPOKE",
    hub: "a",
    h1: "Migliori scarpe running: classifica 2026",
    keywords: [{ text: "migliori scarpe running", volume: 2900 }],
  },
  { key: "b", kind: "HUB", h1: "Calzini tecnici: tutto quello che c'è da sapere", keywords: [{ text: "calzini tecnici", volume: 320 }] },
];

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

beforeEach(async () => {
  await resetDatabase();
});

async function pdfFor(pages: PlanPageSpec[], query: string) {
  const owner = await createUserWithSession({ displayName: `t1907-${randomUUID().slice(0, 8)}` });
  const project = await prisma.project.create({ data: { name: "Progetto PDF", workspace_id: owner.workspaceId, language_code: "it" } });
  const { strategyId } = await insertStrategy({ projectId: project.id, pages, unassigned: [{ text: "borraccia sportiva", volume: 210 }] });
  return callRoute(exportStrategy, {
    url: `/api/projects/${project.id}/strategies/${strategyId}/export?${query}`,
    cookie: owner.cookie,
    params: { id: project.id, strategyId },
  });
}

async function pdfText(response: Response): Promise<{ bytes: Uint8Array; text: string }> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const document = await getDocumentProxy(bytes.slice());
  const { text } = await extractText(document, { mergePages: true });
  return { bytes, text: text.replace(/\s+/g, " ") };
}

describe("PDF della strategia", () => {
  // covers: AC-1907-1
  it("risponde con un PDF allegato che contiene il progetto e l'H1 di entrambi gli hub", async () => {
    const response = await pdfFor(TWO_HUBS, "format=pdf");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename=".+\.pdf"$/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { bytes, text } = await pdfText(response);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(text).toContain("Progetto PDF");
    expect(text).toContain("Scarpe running: la guida pratica");
    expect(text).toContain("Calzini tecnici: tutto quello che c'è da sapere");
  }, 60_000);

  // covers: AC-1907-2
  it("con lang en le spiegazioni sono in inglese e gli H1 restano in italiano", async () => {
    const response = await pdfFor(TWO_HUBS, "format=pdf&lang=en");

    expect(response.status).toBe(200);
    const { text } = await pdfText(response);
    expect(text).toContain(en.strategy.pdf.explainTitle);
    expect(text).toContain("Scarpe running: la guida pratica");
    expect(text).toContain("Migliori scarpe running: classifica 2026");
  }, 60_000);

  // covers: AC-1907-3
  it("un H1 con un tag script è reso come testo", async () => {
    const pages: PlanPageSpec[] = [{ key: "x", kind: "HUB", h1: "<script>alert(1)</script> guida", keywords: [{ text: "guida", volume: 10 }] }];

    const response = await pdfFor(pages, "format=pdf");

    expect(response.status).toBe(200);
    expect((await pdfText(response)).text).toContain("<script>alert(1)</script> guida");
  }, 60_000);
});
