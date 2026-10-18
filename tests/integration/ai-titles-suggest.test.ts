// Gate di T-3601 (AC-3601-1…6): la proposta dei titoli con l'AI per una pagina del piano, con i permessi delle
// modifiche del piano, il limite per workspace e il tetto della piattaforma (root admin escluso, D-43), la proposta
// salvata nella pagina senza toccare titoli e version, gli H2 in eccesso tenuti nei primi e nei log solo id ed esito.
import { randomBytes, randomUUID } from "node:crypto";
import { UserRole } from "@/lib/generated/prisma/enums";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as readAiTitles } from "@/app/api/admin/ai-titles/route";
import {
  completion,
  failure,
  insertPlan,
  memberWithPlan,
  pageRow,
  saveAiSettings,
  type Session,
  strategyVersion,
  stubOpenRouterEnv,
  suggest,
} from "../helpers/ai-titles";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type SuggestBody = { data?: { h1: string; h2: string[]; model: string; createdAt: string }; code?: string; retryAfter?: number };

const fetchMock = vi.fn<typeof fetch>();
const H1 = "Scarpe running donna: come sceglierle";

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("LOG_LEVEL", "info");
  // app_settings è cifrata: una chiave casuale di test.
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  stubOpenRouterEnv();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  await resetDatabase();
  return () => vi.unstubAllGlobals();
});

async function statuses(responses: Response[]): Promise<(number | string)[]> {
  return Promise.all(
    responses.map(async (response) => {
      const body = (await response.json()) as SuggestBody;
      return body.code ? `${response.status} ${body.code}` : response.status;
    })
  );
}

const rootAdmin = () =>
  createUserWithSession({ displayName: `t3601-root-${randomUUID().slice(0, 8)}`, role: UserRole.ADMIN, isRootAdmin: true });

/** «Proposte nelle ultime 24 ore» della card, letta dal root admin (uno solo per installazione). */
async function used24h(root?: Session): Promise<number> {
  root ??= await rootAdmin();
  const response = await callRoute(readAiTitles, { url: "/api/admin/ai-titles", cookie: root.cookie });
  return ((await response.json()) as { data: { used24h: number } }).data.used24h;
}

describe("proposta dei titoli con l'AI", () => {
  // covers: AC-3601-1
  it("risponde 200 no-store con la proposta, invia solo le keyword, salva la proposta e lascia titoli e version", async () => {
    await saveAiSettings();
    const { member, plan, spoke } = await memberWithPlan("t3601", { projectName: "Cliente-Segreto-XYZ" });
    const before = await pageRow(spoke.pageId);
    fetchMock.mockResolvedValueOnce(completion({ h1: H1, h2: ["Ammortizzazione", "Taglie"] }));
    const lines: string[] = [];
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    });

    const response = await suggest(member.cookie, spoke).finally(() => stdout.mockRestore());
    const body = (await response.json()) as SuggestBody;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data).toMatchObject({ h1: H1, h2: ["Ammortizzazione", "Taglie"], model: "autore/modello-prova:free" });
    const sent = String(fetchMock.mock.calls[0][1]?.body);
    expect(sent).toContain("scarpe running donna");
    expect(sent).not.toContain("Cliente-Segreto-XYZ");

    const after = await pageRow(spoke.pageId);
    expect({ h1: after.h1, h2: after.h2, h1_edited: after.h1_edited, h2_edited: after.h2_edited }).toEqual({
      h1: before.h1,
      h2: before.h2,
      h1_edited: before.h1_edited,
      h2_edited: before.h2_edited,
    });
    expect(await strategyVersion(plan.strategyId)).toBe(3);
    expect(after.ai_proposal).toMatchObject({ h1: H1, h2: ["Ammortizzazione", "Taglie"], model: "autore/modello-prova:free" });

    expect(lines.some((line) => line.includes('"msg":"ai_titles_suggest"') && line.includes('"outcome":"ok"'))).toBe(true);
    expect(lines.filter((line) => line.includes("scarpe running donna"))).toEqual([]);
  });

  // covers: AC-3601-2
  it("conta il limite per workspace e il tetto della piattaforma, anche per una chiamata fallita", async () => {
    await saveAiSettings({ workspaceDailyLimit: 2, platformDailyLimit: 3 });
    const first = await memberWithPlan("t3601-w1");
    const second = await memberWithPlan("t3601-w2");
    fetchMock.mockResolvedValueOnce(failure()).mockImplementation(async () => completion({ h1: H1, h2: ["Ammortizzazione"] }));

    const w1: Response[] = [];
    for (let index = 0; index < 3; index += 1) w1.push(await suggest(first.member.cookie, first.spoke));
    const w2: Response[] = [];
    for (let index = 0; index < 2; index += 1) w2.push(await suggest(second.member.cookie, second.spoke));

    const limited = (await w1[2].clone().json()) as SuggestBody;
    expect(await statuses(w1)).toEqual(["502 AI_UNAVAILABLE", 200, "429 RATE_LIMITED"]);
    expect(limited.retryAfter).toBeGreaterThan(0);
    expect(Number(w1[2].headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await statuses(w2)).toEqual([200, "429 RATE_LIMITED"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // covers: AC-3601-3
  // impacted-by: T-3802 (con i modelli di riserva, nessuna risposta valida da tutto l'elenco è 502 AI_UNAVAILABLE)
  it("senza chiave o a funzione spenta risponde 503 senza consumare i limiti; una risposta non valida è 502 e conta", async () => {
    const { member, spoke } = await memberWithPlan("t3601");
    fetchMock.mockImplementation(async () => completion({ h1: "Le migliori calzature", h2: ["Ammortizzazione"] }));

    vi.stubEnv("OPENROUTER_API_KEY", "");
    await saveAiSettings();
    const missingKey = await suggest(member.cookie, spoke);
    stubOpenRouterEnv();
    await saveAiSettings({ enabled: false });
    const disabled = await suggest(member.cookie, spoke);
    await saveAiSettings();
    const invalid = await suggest(member.cookie, spoke);

    expect(await statuses([missingKey, disabled, invalid])).toEqual([
      "503 AI_NOT_CONFIGURED",
      "503 AI_NOT_CONFIGURED",
      "502 AI_UNAVAILABLE",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await used24h()).toBe(1);
  });

  // covers: AC-3601-4
  it("fuori dal workspace 404, senza sessione 401, su una versione precedente 409, senza chiamare il modello", async () => {
    await saveAiSettings();
    const { owner, member, spoke } = await memberWithPlan("t3601");
    const previous = await insertPlan(owner, { projectId: spoke.projectId, createdAt: new Date(Date.now() - 86_400_000) });
    const stranger = await createUserWithSession({ displayName: `t3601-stranger-${randomUUID().slice(0, 8)}` });

    const responses = [
      await suggest(stranger.cookie, spoke),
      await suggest(undefined, spoke),
      await suggest(member.cookie, { projectId: spoke.projectId, strategyId: previous.strategyId, pageId: previous.pageIds.spoke }),
    ];

    expect(await statuses(responses)).toEqual(["404 PROJECT_NOT_FOUND", "401 AUTH_REQUIRED", "409 STRATEGY_READ_ONLY"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // covers: AC-3601-5
  it("il root admin non consuma i limiti e non entra nelle proposte contate", async () => {
    await saveAiSettings({ workspaceDailyLimit: 1, platformDailyLimit: 1 });
    const root = await rootAdmin();
    const rootPlan = await insertPlan(root);
    const rootSpoke = { projectId: rootPlan.projectId, strategyId: rootPlan.strategyId, pageId: rootPlan.pageIds.spoke };
    const { member, spoke } = await memberWithPlan("t3601");
    fetchMock.mockImplementation(async () => completion({ h1: H1, h2: ["Ammortizzazione"] }));

    const rootResponses: Response[] = [];
    for (let index = 0; index < 3; index += 1) rootResponses.push(await suggest(root.cookie, rootSpoke));
    const memberResponses: Response[] = [];
    for (let index = 0; index < 2; index += 1) memberResponses.push(await suggest(member.cookie, spoke));

    expect(await statuses(rootResponses)).toEqual([200, 200, 200]);
    expect(await statuses(memberResponses)).toEqual([200, "429 RATE_LIMITED"]);
    expect(await used24h(root)).toBe(1);
  });

  // covers: AC-3601-6
  it("oltre il massimo dello spoke tiene i primi 12 H2 nell'ordine della risposta", async () => {
    await saveAiSettings();
    const { member, spoke } = await memberWithPlan("t3601");
    const thirteen = Array.from({ length: 13 }, (_, index) => `Argomento numero ${index + 1}`);
    fetchMock.mockResolvedValueOnce(completion({ h1: H1, h2: thirteen }));

    const response = await suggest(member.cookie, spoke);
    const body = (await response.json()) as SuggestBody;

    expect(response.status).toBe(200);
    expect(body.data?.h2).toEqual(thirteen.slice(0, 12));
  });
});
