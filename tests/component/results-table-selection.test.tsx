// Gate di T-803 (AC-803-3, AC-803-4): dopo «Seleziona tutto» la tabella offre l'intero set filtrato e
// la PATCH parte con i filtri invece degli id; la selezione si azzera quando cambiano le righe ricevute.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResultsTable } from "@/components/results-table";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const fetchMock = vi.fn<typeof fetch>();

function row(id: string, keyword: string) {
  return {
    id,
    subproject_id: "s1",
    subproject_name: "Generale",
    keyword,
    source: "seed",
    brand_status: "allowed",
    review_status: "pending",
    selected_for_export: false,
    keyword_type: "generic",
    search_intent: "mixed",
    avg_monthly_searches: null,
    competition: null,
    score: 10,
  };
}

const FIRST_PAGE = [row("r1", "scarpe uno"), row("r2", "scarpe due"), row("r3", "scarpe tre")];
const SECOND_PAGE = [row("r4", "scarpe quattro"), row("r5", "scarpe cinque"), row("r6", "scarpe sei")];
const FILTERS = { reviewStatus: "pending", searchText: "scarpe" };

beforeEach(() => {
  fetchMock.mockReset();
  router.refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResultsTable, selezione", () => {
  // covers: AC-803-3
  it("offre le 1234 keyword filtrate e invia la PATCH con filters e senza ids", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, updated: 1234 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    renderWithIntl(
      <ResultsTable projectId="p1" activeSubprojectId="s1" rows={FIRST_PAGE} filteredCount={1234} filters={FILTERS} />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona tutto" }));
    expect(screen.getByRole("button", { name: "Applica a 3 selezionate" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Seleziona tutte le 1234 keyword filtrate" }));
    const apply = screen.getByRole("button", { name: /^Applica a 1234/ });
    expect(apply).toHaveTextContent("1234");

    fireEvent.click(apply);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body).toHaveProperty("filters", FILTERS);
    expect(body).not.toHaveProperty("ids");
  });

  // covers: AC-803-4
  it("al cambio di pagina la selezione si azzera", () => {
    const { rerender } = renderWithIntl(
      <ResultsTable projectId="p1" activeSubprojectId="s1" rows={FIRST_PAGE} filteredCount={6} filters={FILTERS} />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona tutto" }));
    expect(screen.getByRole("button", { name: "Applica a 3 selezionate" })).toBeEnabled();

    rerender(<ResultsTable projectId="p1" activeSubprojectId="s1" rows={SECOND_PAGE} filteredCount={6} filters={FILTERS} />);

    expect(screen.getByRole("button", { name: "Applica a 0 selezionate" })).toBeDisabled();
    const rowCheckboxes = screen.getAllByRole("checkbox").filter((box) => box.getAttribute("aria-label") !== "Seleziona tutto");
    expect(rowCheckboxes).toHaveLength(3);
    expect(rowCheckboxes.some((box) => (box as HTMLInputElement).checked)).toBe(false);
  });
});
