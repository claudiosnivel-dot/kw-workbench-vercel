// Gate di T-6202 (AC-6202-1, AC-6202-2): «Costruisci il piano» avvia il lavoro di piano e mostra la fase con
// l'avanzamento finché il lavoro non è completed, poi la pagina del piano si ricarica; sopra il piano l'avviso del
// raggruppamento di riserva con il motivo, nessun avviso senza motivo. In più il lavoro non riuscito con «Riprova».
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanGroupingNotice } from "@/components/plan/plan-grouping-notice";
import { StrategySettings } from "@/components/strategy/strategy-settings";
import { DEFAULT_RULES, RULE_LIMITS } from "@/lib/modules/strategy/rules";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const fetchMock = vi.fn<typeof fetch>();

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function runState(status: string, phase: string, done: number, total: number, extra: Record<string, unknown> = {}) {
  return json(200, { data: { id: "run-1", status, phase, progress: { done, total }, strategyId: null, errorCode: null, ...extra } });
}

async function advance(ms: number): Promise<void> {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

/** La risposta della POST monta l'avanzamento, che legge subito lo stato: due giri di timer. */
async function settle(): Promise<void> {
  await advance(100);
  await advance(100);
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  router.push.mockReset();
  router.refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderPlanForm() {
  renderWithIntl(<StrategySettings projectId="p1" sections={[]} defaults={DEFAULT_RULES} limits={RULE_LIMITS} />);
}

describe("avanzamento del piano", () => {
  // covers: AC-6202-1
  it("dopo «Costruisci il piano» mostra «Leggo i risultati di Google» con l'avanzamento, poi la pagina si ricarica", async () => {
    fetchMock
      .mockResolvedValueOnce(json(202, { data: { runId: "run-1" } }))
      .mockResolvedValueOnce(runState("running", "serps_collect", 120, 300))
      .mockResolvedValueOnce(runState("completed", "done", 300, 300, { strategyId: "st-1" }));
    renderPlanForm();

    fireEvent.click(screen.getByRole("button", { name: "Costruisci il piano" }));
    await settle();

    expect(screen.getByText("Leggo i risultati di Google")).toBeVisible();
    const bar = screen.getByRole("progressbar", { name: "Avanzamento della preparazione del piano" });
    expect(bar).toHaveAttribute("aria-valuenow", "120");
    expect(bar).toHaveAttribute("aria-valuemax", "300");
    expect(screen.getByText("120 di 300 keyword")).toBeVisible();
    expect(router.refresh).not.toHaveBeenCalled();

    await advance(2000);
    expect(router.push).toHaveBeenCalledWith("/projects/p1/plan");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/projects/p1/strategies",
      "/api/projects/p1/plan-runs/run-1",
      "/api/projects/p1/plan-runs/run-1",
    ]);

    await advance(20000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("a lavoro non riuscito mostra il motivo e «Riprova» avvia un lavoro nuovo con la stessa richiesta", async () => {
    fetchMock
      .mockResolvedValueOnce(json(202, { data: { runId: "run-1" } }))
      .mockResolvedValueOnce(runState("failed", "cluster", 6, 6, { errorCode: "INTERNAL_ERROR" }))
      .mockResolvedValueOnce(json(202, { data: { runId: "run-2" } }))
      .mockResolvedValueOnce(runState("running", "volumes", 0, 0, { id: "run-2" }));
    renderPlanForm();

    fireEvent.click(screen.getByRole("button", { name: "Costruisci il piano" }));
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent("Il piano non è stato preparato.");
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    await settle();

    expect(screen.getByText("Cerco i volumi")).toBeVisible();
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([{ mode: "AUTO" }, { mode: "AUTO" }]);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("con un lavoro già attivo nel progetto segue quello", async () => {
    fetchMock
      .mockResolvedValueOnce(json(409, { code: "JOB_ALREADY_ACTIVE", error: "x", requestId: "r", runId: "run-9" }))
      .mockResolvedValueOnce(runState("running", "cluster", 6, 6, { id: "run-9" }));
    renderPlanForm();

    fireEvent.click(screen.getByRole("button", { name: "Costruisci il piano" }));
    await settle();

    expect(screen.getByText("Raggruppo le keyword")).toBeVisible();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/projects/p1/plan-runs/run-9");
  });
});

describe("avviso del raggruppamento di riserva", () => {
  // covers: AC-6202-2
  it("con ENGINE e PLAN_NO_LICENSED_METRICS dice che il raggruppamento è di riserva e perché; con SERP e nessun motivo non c'è", () => {
    const { unmount } = renderWithIntl(<PlanGroupingNotice grouping={{ source: "ENGINE", notice: "PLAN_NO_LICENSED_METRICS" }} />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Raggruppamento di riserva");
    expect(notice).toHaveTextContent("Le keyword sono raggruppate per le parole che hanno in comune, senza i risultati di Google.");
    expect(notice).toHaveTextContent("Il piano del workspace non comprende i volumi di DataForSEO.");
    unmount();

    renderWithIntl(<PlanGroupingNotice grouping={{ source: "SERP", notice: null }} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("Raggruppamento di riserva")).toBeNull();
  });

  it("i motivi dei risultati di Google hanno il loro testo", () => {
    renderWithIntl(<PlanGroupingNotice grouping={{ source: "ENGINE", notice: "SERP_TIMEOUT" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("I risultati di Google non sono arrivati in tempo.");
  });

  // impacted-by: T-6303 (motivi SERP_TOO_FEW e dell'AI; con SERP come fonte il titolo dice che il raggruppamento usa i
  // risultati di Google e non c'è il testo del raggruppamento per parole)
  it("con SERP e l'AI che non ha risposto dice perché luoghi e concorrenti sono riconosciuti in parte; SERP_TOO_FEW ha il suo testo", () => {
    const { unmount } = renderWithIntl(<PlanGroupingNotice grouping={{ source: "SERP", notice: "AI_CLASSIFY_UNAVAILABLE" }} />);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Raggruppamento con i risultati di Google");
    expect(notice).toHaveTextContent("L'AI non ha risposto: luoghi e concorrenti sono riconosciuti solo da parole come «vicino a me»");
    expect(notice).not.toHaveTextContent("Le keyword sono raggruppate per le parole che hanno in comune");
    unmount();

    renderWithIntl(<PlanGroupingNotice grouping={{ source: "ENGINE", notice: "SERP_TOO_FEW" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("I risultati di Google sono arrivati per meno di metà delle keyword.");
  });
});
