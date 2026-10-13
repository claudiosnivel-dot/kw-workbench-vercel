// Gate di T-2404 (AC-2404-2): il riquadro della ricerca in corso dice in parole semplici cosa succede e quante keyword
// ha trovato, senza parole tecniche.
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchProgress } from "@/components/search-progress";
import it_ from "@/messages/it.json";
import { renderWithIntl } from "./intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("SearchProgress", () => {
  // covers: AC-2404-2
  it("in fase metrics con 57 keyword trovate dice che recupera i volumi e il numero, senza job, seed o fase", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: "job-1",
            status: "running",
            phase: "metrics",
            progress: { done: 20, total: 57 },
            result: null,
            error: null,
            recentSuggestions: ["scarpe running donna", "scarpe running uomo"],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    renderWithIntl(<SearchProgress jobId="job-1" />);

    await act(() => vi.advanceTimersByTimeAsync(2000));

    const text = screen.getByRole("region", { name: it_.keywords.searchProgress.title }).textContent ?? "";
    expect(text).toContain(it_.keywords.searchProgress.phase.metrics);
    expect(text).toContain("57");
    expect(text).toContain("scarpe running donna");
    expect(text.toLowerCase()).not.toMatch(/(^|[^\p{L}])(job|seed|fase)([^\p{L}]|$)/u);
  });
});
