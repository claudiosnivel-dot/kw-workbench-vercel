// Gate di T-1205 (AC-1205-1…AC-1205-3): avanzamento con polling e backoff, esito finale esplicito e nessun link ai
// risultati per un job fallito.
// impacted-by: T-2306 (onboarding rimosso: AC-1205-3 emendato sul pulsante di avvio dell'estrazione)
// impacted-by: T-2702 (pulsante di avvio rimosso: AC-1205-3 emendato su JobProgress montato con il jobId)
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobProgress } from "@/components/job-progress";
import { renderWithIntl } from "./intl";

const RESULTS_HREF = "/projects/p1/results?subprojectId=s1";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function jobState(status: string, phase: string, done: number, total: number, error: string | null = null) {
  return { data: { id: "job-1", status, phase, progress: { done, total }, result: null, error } };
}

async function advance(ms: number): Promise<void> {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("JobProgress", () => {
  // covers: AC-1205-1
  it("mostra fase e conteggi, a completed il link ai risultati, poi smette di interrogare", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, jobState("running", "autocomplete", 3, 10)))
      .mockResolvedValueOnce(jsonResponse(200, jobState("completed", "done", 10, 10)));
    renderWithIntl(<JobProgress jobId="job-1" resultsHref={RESULTS_HREF} />);

    await advance(2000);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "10");
    expect(screen.getByText("Suggerimenti")).toBeVisible();

    await advance(2000);
    expect(screen.getByRole("link", { name: "Vedi risultati" })).toHaveAttribute("href", RESULTS_HREF);

    await advance(20000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // covers: AC-1205-2
  it("con tre 503 di seguito raddoppia l'intervallo e al primo successo torna a 2 s", async () => {
    const mountedAt = Date.now();
    const calledAt: number[] = [];
    fetchMock.mockImplementation(async () => {
      calledAt.push(Date.now() - mountedAt);
      return calledAt.length <= 3
        ? jsonResponse(503, { error: "Servizio non disponibile" })
        : jsonResponse(200, jobState("running", "autocomplete", 1, 10));
    });
    renderWithIntl(<JobProgress jobId="job-1" resultsHref={RESULTS_HREF} />);

    await advance(32000);

    expect(calledAt).toEqual([2000, 6000, 14000, 30000, 32000]);
  });
});

describe("JobProgress di una ricerca fallita", () => {
  // covers: AC-1205-3
  it("a job failed mostra l'errore e nessun link ai risultati", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, jobState("failed", "expand", 0, 0, "Nessuna seed nella sezione")));
    renderWithIntl(<JobProgress jobId="job-1" resultsHref={RESULTS_HREF} />);

    await advance(2000);

    expect(fetchMock).toHaveBeenCalledWith("/api/jobs/job-1", expect.anything());
    expect(screen.getByText("Nessuna seed nella sezione")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Vedi risultati" })).toBeNull();
  });
});
