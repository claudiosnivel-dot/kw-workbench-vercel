// Gate di T-7402 (AC-7402-1, AC-7402-2, D-64): Claude Code legge con get_serps i primi 10 risultati di Google salvati
// per le keyword di un progetto, con lingua e paese del progetto e la data di ogni riga; nessuna richiesta a DataForSEO.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callTool, rootAdminWithKey } from "../helpers/mcp";

type SerpResult = { position: number; url: string; title: string | null; description: string | null };
type SerpEntry = { keyword: string; canonical: string; fetchedAt: string | null; results: SerpResult[]; note?: string };
type SerpsReply = { language: string; country: string; keywords: SerpEntry[] };

const MAIN = "Noleggio Magnetoterapia";
const COST = "magnetoterapia costo";
const MISSING = "magnetoterapia farmacia";
const DAY_MS = 86_400_000;

const fetchMock = vi.fn(async () => new Response("{}", { status: 404 }));

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubGlobal("fetch", fetchMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
  fetchMock.mockClear();
});

const canonical = (keyword: string) => canonicalizeKeyword(keyword, "it");
const urlOf = (rank: number, slug: string) => `https://sito-${rank}.example/${slug}`;

async function italianProject(workspaceId: string) {
  return prisma.project.create({ data: { name: "Magnetoterapia", workspace_id: workspaceId, language_code: "it", country_code: "IT" } });
}

describe("get_serps del server MCP", () => {
  // covers: AC-7402-1
  it("dà i 10 risultati con il titolo, gli url di una riga di prima con il titolo null e results vuoto con la nota; nessuna richiesta a DataForSEO", async () => {
    const root = await rootAdminWithKey("t7402-serps");
    const project = await italianProject(root.workspaceId);
    const ranks = Array.from({ length: 10 }, (_, index) => index + 1);
    const fetchedAt = new Date(Date.now() - 3 * DAY_MS);
    const oldFetchedAt = new Date(Date.now() - 40 * DAY_MS);
    await prisma.keywordSerp.createMany({
      data: [
        {
          language_code: "it",
          country_code: "IT",
          canonical_keyword: canonical(MAIN),
          urls: ranks.map((rank) => urlOf(rank, "noleggio")),
          results: ranks.map((rank) => ({ url: urlOf(rank, "noleggio"), title: `Titolo ${rank}`, description: rank === 2 ? null : `Descrizione ${rank}` })),
          fetched_at: fetchedAt,
        },
        // Riga salvata prima di T-7401: solo gli URL, più vecchia di 30 giorni.
        { language_code: "it", country_code: "IT", canonical_keyword: canonical(COST), urls: [urlOf(1, "costo"), urlOf(2, "costo")], fetched_at: oldFetchedAt },
        // Stessa keyword in un'altra lingua e paese: get_serps usa quelli del progetto.
        { language_code: "es", country_code: "ES", canonical_keyword: canonical(MAIN), urls: ["https://otro.example/"], fetched_at: fetchedAt },
      ],
    });

    const { result, data } = await callTool(root.key, "get_serps", { projectId: project.id, keywords: [MAIN, COST, MISSING] });

    expect(result?.isError).toBeFalsy();
    const reply = data as unknown as SerpsReply;
    expect(reply.language).toBe("it");
    expect(reply.country).toBe("IT");
    expect(reply.keywords.map((entry) => entry.keyword)).toEqual([MAIN, COST, MISSING]);
    const [main, cost, missing] = reply.keywords;

    expect(main.canonical).toBe(canonical(MAIN));
    expect(main.fetchedAt).toBe(fetchedAt.toISOString());
    expect(main.results).toHaveLength(10);
    expect(main.results[0]).toEqual({ position: 1, url: urlOf(1, "noleggio"), title: "Titolo 1", description: "Descrizione 1" });
    expect(main.results[1]).toEqual({ position: 2, url: urlOf(2, "noleggio"), title: "Titolo 2", description: null });
    expect(main.results.map((entry) => entry.title)).toEqual(ranks.map((rank) => `Titolo ${rank}`));
    expect(main.note).toBeUndefined();

    expect(cost.fetchedAt).toBe(oldFetchedAt.toISOString());
    expect(cost.results).toEqual([
      { position: 1, url: urlOf(1, "costo"), title: null, description: null },
      { position: 2, url: urlOf(2, "costo"), title: null, description: null },
    ]);

    expect(missing).toMatchObject({ canonical: canonical(MISSING), fetchedAt: null, results: [] });
    expect(missing.note).toMatch(/build_plan/);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await prisma.metricsProviderRequest.count()).toBe(0);
    const calls = await prisma.agentCall.findMany();
    expect(calls.map(({ tool, ok, project_id }) => ({ tool, ok, project_id }))).toEqual([{ tool: "get_serps", ok: true, project_id: project.id }]);
  });

  // covers: AC-7402-2
  it("con 51 keyword è VALIDATION_ERROR, con il progetto di un workspace di cui il root admin non è membro è PROJECT_NOT_FOUND", async () => {
    const root = await rootAdminWithKey("t7402-denied");
    const own = await italianProject(root.workspaceId);
    const owner = await createUserWithSession({ displayName: "t7402-proprietario" });
    const foreign = await italianProject(owner.workspaceId);
    await prisma.keywordSerp.create({
      data: { language_code: "it", country_code: "IT", canonical_keyword: canonical(MAIN), urls: [urlOf(1, "noleggio")] },
    });

    const tooMany = await callTool(root.key, "get_serps", {
      projectId: own.id,
      keywords: Array.from({ length: 51 }, (_, index) => `magnetoterapia ${index}`),
    });
    const denied = await callTool(root.key, "get_serps", { projectId: foreign.id, keywords: [MAIN] });

    expect(tooMany.result?.isError).toBe(true);
    expect(tooMany.data).toMatchObject({ code: "VALIDATION_ERROR", field: "keywords" });
    expect(denied.result?.isError).toBe(true);
    expect(denied.data).toMatchObject({ code: "PROJECT_NOT_FOUND" });
    expect(JSON.stringify(denied.data)).not.toContain("sito-1.example");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("una keyword passata due volte con la stessa forma canonica compare una volta; una lista vuota è VALIDATION_ERROR", async () => {
    const root = await rootAdminWithKey("t7402-duplicates");
    const project = await italianProject(root.workspaceId);

    const twice = await callTool(root.key, "get_serps", { projectId: project.id, keywords: [MISSING, "Magnetoterapia  Farmacia", COST] });
    const empty = await callTool(root.key, "get_serps", { projectId: project.id, keywords: [] });

    const reply = twice.data as unknown as SerpsReply;
    expect(reply.keywords.map((entry) => entry.keyword)).toEqual([MISSING, COST]);
    expect(empty.result?.isError).toBe(true);
    expect(empty.data).toMatchObject({ code: "VALIDATION_ERROR", field: "keywords" });
  });
});
