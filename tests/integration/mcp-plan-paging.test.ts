// Gate di T-8201 (AC-8201-1…3, D-70): get_plan restituisce il piano a pagine, così un piano grande resta sotto il limite
// di output di Claude Code. Ogni risposta porta pagine intere nell'ordine di lavoro fino a 1000 keyword (una pagina più
// grande esce da sola), poi le non assegnate a gruppi di 1000, e un nextCursor con la version del piano: se il piano
// cambia nel frattempo il cursore è STRATEGY_CONFLICT con la version nuova, così una lettura non mescola due versioni.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchPage } from "@/app/api/projects/[id]/strategies/[strategyId]/pages/[pageId]/route";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { callTool, rootAdminWithKey } from "../helpers/mcp";
import { insertStrategy, type PlanKeywordSpec } from "../helpers/strategy";

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

type PlanReply = {
  strategyId: string;
  version: number;
  totalPages: number;
  totalUnassigned: number;
  pages: { id: string; number: number; keywords: { id: string }[] }[];
  unassigned: { id: string }[];
  nextCursor: string | null;
};

/** Keyword con testi diversi per pagina: «<prefisso> 1», «<prefisso> 2», … */
const keywords = (prefix: string, count: number): PlanKeywordSpec[] =>
  Array.from({ length: count }, (_, index) => ({ text: `${prefix} ${index + 1}`, volume: 10 }));

/** Piano del progetto del root admin: una pilastro e i suoi spoke con le keyword date, e le non assegnate. */
async function plan(root: Root, sizes: number[], unassigned: number, version = 0) {
  const project = await prisma.project.create({ data: { name: "Magnetoterapia", workspace_id: root.workspaceId } });
  const saved = await insertStrategy({
    projectId: project.id,
    version,
    pages: sizes.map((size, index) =>
      index === 0
        ? { key: "p1", kind: "HUB" as const, keywords: keywords("pagina 1", size) }
        : { key: `p${index + 1}`, kind: "SPOKE" as const, hub: "p1", keywords: keywords(`pagina ${index + 1}`, size) }
    ),
    unassigned: keywords("non assegnata", unassigned),
  });
  return { projectId: project.id, ...saved };
}

const getPlan = async (root: Root, projectId: string, cursor?: string) =>
  callTool(root.key, "get_plan", { projectId, ...(cursor === undefined ? {} : { cursor }) });

/** Tutte le risposte di get_plan, senza cursore e poi con ogni nextCursor finché è null (al massimo 10). */
async function readAll(root: Root, projectId: string): Promise<PlanReply[]> {
  const replies: PlanReply[] = [];
  let cursor: string | undefined;
  do {
    const { result, data } = await getPlan(root, projectId, cursor);
    expect(result?.isError).not.toBe(true);
    const reply = data as unknown as PlanReply;
    replies.push(reply);
    cursor = reply.nextCursor ?? undefined;
  } while (cursor !== undefined && replies.length < 10);
  return replies;
}

describe("get_plan a pagine", () => {
  // covers: AC-8201-1
  it("3 pagine da 600 keyword e 1500 non assegnate danno 5 risposte: una pagina ciascuna, poi 1000 e 500 non assegnate, con la stessa version", async () => {
    const root = await rootAdminWithKey("t8201-paging");
    const saved = await plan(root, [600, 600, 600], 1500, 2);

    const replies = await readAll(root, saved.projectId);

    expect(replies).toHaveLength(5);
    expect(replies.map((reply) => reply.pages.map((page) => page.number))).toEqual([[1], [2], [3], [], []]);
    expect(replies.map((reply) => reply.pages.map((page) => page.keywords.length))).toEqual([[600], [600], [600], [], []]);
    expect(replies.map((reply) => reply.unassigned.length)).toEqual([0, 0, 0, 1000, 500]);
    expect(replies.map((reply) => reply.version)).toEqual([2, 2, 2, 2, 2]);
    expect(replies.every((reply) => reply.strategyId === saved.strategyId && reply.totalPages === 3 && reply.totalUnassigned === 1500)).toBe(true);
    expect(replies.slice(0, 4).every((reply) => typeof reply.nextCursor === "string")).toBe(true);
    expect(replies[4].nextCursor).toBeNull();
    expect(replies.flatMap((reply) => reply.pages.map((page) => page.id))).toEqual([saved.pageIds.p1, saved.pageIds.p2, saved.pageIds.p3]);
    const unassignedIds = replies.flatMap((reply) => reply.unassigned.map((keyword) => keyword.id));
    expect(new Set(unassignedIds).size).toBe(1500);
    expect(unassignedIds).toContain(saved.keywordIds["non assegnata 1"]);
    expect(unassignedIds).toContain(saved.keywordIds["non assegnata 1500"]);
  });

  // covers: AC-8201-2
  it("con il nextCursor della prima risposta, dopo che l'utente ha cambiato il piano, è STRATEGY_CONFLICT con la version nuova", async () => {
    const root = await rootAdminWithKey("t8201-conflict");
    const saved = await plan(root, [600, 600], 0, 4);
    const first = (await getPlan(root, saved.projectId)).data as unknown as PlanReply;
    expect(first.pages.map((page) => page.number)).toEqual([1]);
    expect(typeof first.nextCursor).toBe("string");

    const edited = await callRoute(patchPage, {
      method: "PATCH",
      url: `/api/projects/${saved.projectId}/strategies/${saved.strategyId}/pages/${saved.pageIds.p2}`,
      cookie: root.cookie,
      params: { id: saved.projectId, strategyId: saved.strategyId, pageId: saved.pageIds.p2 },
      body: { version: 4, h1: "H1 scritto dall'utente" },
    });
    expect(edited.status).toBe(200);
    const stale = await getPlan(root, saved.projectId, first.nextCursor!);

    expect(stale.result?.isError).toBe(true);
    expect(stale.data).toMatchObject({ code: "STRATEGY_CONFLICT", currentVersion: 5 });
  });

  // covers: AC-8201-3
  it("2 pagine da 10 keyword e 5 non assegnate stanno in una sola risposta con nextCursor null", async () => {
    const root = await rootAdminWithKey("t8201-small");
    const saved = await plan(root, [10, 10], 5);

    const { result, data } = await getPlan(root, saved.projectId);

    expect(result?.isError).not.toBe(true);
    const reply = data as unknown as PlanReply;
    expect(reply.pages.map((page) => page.number)).toEqual([1, 2]);
    expect(reply.pages.map((page) => page.keywords.length)).toEqual([10, 10]);
    expect(reply.unassigned).toHaveLength(5);
    expect(reply).toMatchObject({ totalPages: 2, totalUnassigned: 5, nextCursor: null });
  });

  it("una pagina con più di 1000 keyword esce da sola, le non assegnate stanno con l'ultima pagina se c'è posto e un cursore non valido è VALIDATION_ERROR", async () => {
    const root = await rootAdminWithKey("t8201-large");
    const saved = await plan(root, [1200, 10], 3);

    const replies = await readAll(root, saved.projectId);
    const invalid = await getPlan(root, saved.projectId, "non-un-cursore");

    expect(replies.map((reply) => reply.pages.map((page) => page.keywords.length))).toEqual([[1200], [10]]);
    expect(replies.map((reply) => reply.unassigned.length)).toEqual([0, 3]);
    expect(replies[1].nextCursor).toBeNull();
    expect(invalid.result?.isError).toBe(true);
    expect(invalid.data).toMatchObject({ code: "VALIDATION_ERROR", field: "cursor" });
  });
});
