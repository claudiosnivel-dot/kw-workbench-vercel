// Gate di T-1205 (AC-1205-1…AC-1205-3): avanzamento con polling e backoff, esito finale esplicito e onboarding che
// avanza solo a job completed.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobProgress } from "@/components/job-progress";
import { OnboardingRunStep } from "@/components/onboarding-run-step";

const RESULTS_HREF = "/projects/p1/results?subprojectId=s1";

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
    render(<JobProgress jobId="job-1" resultsHref={RESULTS_HREF} />);

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
    render(<JobProgress jobId="job-1" resultsHref={RESULTS_HREF} />);

    await advance(32000);

    expect(calledAt).toEqual([2000, 6000, 14000, 30000, 32000]);
  });
});

describe("OnboardingRunStep con JobProgress", () => {
  // covers: AC-1205-3
  it("a job failed mostra l'errore, nessun link ai risultati e nessuna PATCH dell'onboarding", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === "/api/projects/p1/run" && init?.method === "POST") {
        return jsonResponse(202, { data: { jobId: "job-1", status: "pending", phase: "expand" }, meta: { subprojectId: "s1" } });
      }
      return jsonResponse(200, jobState("failed", "expand", 0, 0, "Nessuna seed nella sezione"));
    });
    render(
      <OnboardingRunStep
        projectId="p1"
        subprojectId="s1"
        projectName="Progetto"
        subprojectName="Sezione"
        resultsHref={RESULTS_HREF}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Avvia prima estrazione" }));
    });
    await advance(2000);

    expect(screen.getByText("Nessuna seed nella sezione")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Vedi risultati" })).toBeNull();
    const patches = fetchMock.mock.calls.filter(
      ([input, init]) => String(input) === "/api/onboarding/state" && init?.method === "PATCH"
    );
    expect(patches).toHaveLength(0);
  });
});
