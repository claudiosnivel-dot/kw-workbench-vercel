// Gate di T-3602 (AC-3602-1…3): l'ultima proposta dei titoli con l'AI resta nella pagina del piano finché non si usa o
// si scarta (D-43): la vista del piano la porta, il DELETE la toglie senza cambiare la version, un errore la lascia
// com'era e fuori dal workspace, senza sessione o su una versione precedente nessuno la tocca.
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as readStrategyRoute } from "@/app/api/projects/[id]/strategies/[strategyId]/route";
import type { StrategyView } from "@/lib/modules/strategy/types";
import { prisma } from "@/lib/prisma";
import {
  completion,
  discard,
  failure,
  insertPlan,
  memberWithPlan,
  pageRow,
  type PlanPage,
  saveAiSettings,
  type Session,
  stubOpenRouterEnv,
  suggest,
} from "../helpers/ai-titles";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const fetchMock = vi.fn<typeof fetch>();
const SAVED = { h1: "Scarpe running donna: guida", h2: ["Taglie"], model: "autore/modello-prova:free", createdAt: "2026-10-17T08:00:00.000Z" };

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
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
  await saveAiSettings();
  return () => vi.unstubAllGlobals();
});

async function readPlan(session: Session, page: PlanPage): Promise<StrategyView> {
  const response = await callRoute(readStrategyRoute, {
    url: `/api/projects/${page.projectId}/strategies/${page.strategyId}`,
    cookie: session.cookie,
    params: { id: page.projectId, strategyId: page.strategyId },
  });
  return ((await response.json()) as { data: StrategyView }).data;
}

const spokeOf = (plan: StrategyView, pageId: string) => plan.hubs.flatMap((hub) => hub.spokes).find((page) => page.id === pageId)!;

describe("proposta conservata nella pagina", () => {
  // covers: AC-3602-1
  it("la vista del piano porta la proposta; il DELETE risponde 204 e la toglie senza cambiare la version", async () => {
    const { member, spoke } = await memberWithPlan("t3602");
    fetchMock.mockResolvedValueOnce(completion({ h1: "Scarpe running donna: come sceglierle", h2: ["Ammortizzazione", "Taglie"] }));

    const suggested = await suggest(member.cookie, spoke);
    const first = await readPlan(member, spoke);
    const removed = await discard(member.cookie, spoke);
    const second = await readPlan(member, spoke);

    expect(suggested.status).toBe(200);
    expect(spokeOf(first, spoke.pageId).aiProposal).toMatchObject({
      h1: "Scarpe running donna: come sceglierle",
      h2: ["Ammortizzazione", "Taglie"],
      model: "autore/modello-prova:free",
    });
    expect(removed.status).toBe(204);
    expect(spokeOf(second, spoke.pageId).aiProposal).toBeNull();
    expect(second.version).toBe(first.version);
  });

  // covers: AC-3602-2
  it("una proposta non riuscita lascia quella salvata, una riuscita la sostituisce", async () => {
    const { member, spoke } = await memberWithPlan("t3602");
    await prisma.strategyPage.update({ where: { id: spoke.pageId }, data: { ai_proposal: SAVED } });
    fetchMock.mockResolvedValueOnce(failure()).mockResolvedValueOnce(completion({ h1: "Scarpe running donna: le migliori", h2: ["Prezzi"] }));

    const failed = await suggest(member.cookie, spoke);
    const afterFailure = await pageRow(spoke.pageId);
    const replaced = await suggest(member.cookie, spoke);
    const afterSuccess = await pageRow(spoke.pageId);

    expect(failed.status).toBe(502);
    expect(afterFailure.ai_proposal).toEqual(SAVED);
    expect(replaced.status).toBe(200);
    expect(afterSuccess.ai_proposal).toMatchObject({ h1: "Scarpe running donna: le migliori" });
  });

  // covers: AC-3602-3
  it("fuori dal workspace 404, senza sessione 401, su una versione precedente 409, e le proposte restano", async () => {
    const { owner, member, spoke } = await memberWithPlan("t3602");
    const previous = await insertPlan(owner, { projectId: spoke.projectId, createdAt: new Date(Date.now() - 86_400_000) });
    await prisma.strategyPage.updateMany({ where: { id: { in: [spoke.pageId, previous.pageIds.spoke] } }, data: { ai_proposal: SAVED } });
    const stranger = await createUserWithSession({ displayName: `t3602-stranger-${randomUUID().slice(0, 8)}` });

    const statuses = [
      (await discard(stranger.cookie, spoke)).status,
      (await discard(undefined, spoke)).status,
    ];
    const readOnly = await discard(member.cookie, { projectId: spoke.projectId, strategyId: previous.strategyId, pageId: previous.pageIds.spoke });

    expect([...statuses, readOnly.status]).toEqual([404, 401, 409]);
    expect(((await readOnly.json()) as { code: string }).code).toBe("STRATEGY_READ_ONLY");
    expect((await pageRow(spoke.pageId)).ai_proposal).toEqual(SAVED);
    expect((await pageRow(previous.pageIds.spoke)).ai_proposal).toEqual(SAVED);
  });

  it("nelle versioni precedenti la vista non mostra la proposta salvata nella riga", async () => {
    const { owner, member, spoke } = await memberWithPlan("t3602");
    const previous = await insertPlan(owner, { projectId: spoke.projectId, createdAt: new Date(Date.now() - 86_400_000) });
    await prisma.strategyPage.update({ where: { id: previous.pageIds.spoke }, data: { ai_proposal: SAVED } });

    const view = await readPlan(member, { projectId: spoke.projectId, strategyId: previous.strategyId, pageId: previous.pageIds.spoke });

    expect(spokeOf(view, previous.pageIds.spoke).aiProposal).toBeNull();
  });
});
