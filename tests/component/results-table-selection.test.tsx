// Gate di T-803 (AC-803-3, AC-803-4): con un filtro attivo l'azione sul set filtrato parte con i filtri invece degli id;
// le scelte locali ripartono dai dati ricevuti quando cambiano le righe.
// impacted-by: T-2403 (la tabella dei risultati con la tendina delle azioni massive è sostituita dalla pagina delle
// keyword: «Scarta queste N» agisce sul set filtrato, il clic su una riga la sposta subito tra le scartate; AC-803-3 e
// AC-803-4 emendati)
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordsBoard } from "@/components/keywords/keywords-board";
import type { KeywordRowData } from "@/lib/modules/keywords-options";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/projects/p1/keywords/s1",
  useSearchParams: () => new URLSearchParams("searchText=scarpe"),
}));

const fetchMock = vi.fn<typeof fetch>();

function row(id: string, keyword: string): KeywordRowData {
  return {
    id,
    keyword,
    topicName: null,
    searches: null,
    score: 10,
    question: false,
    buy: false,
    local: false,
    brandReview: false,
    source: "seed",
    intent: "mixed",
    type: "generic",
    competition: null,
    discarded: false,
  };
}

const FIRST_PAGE = [row("r1", "scarpe uno"), row("r2", "scarpe due"), row("r3", "scarpe tre")];
const SECOND_PAGE = [row("r4", "scarpe quattro"), row("r5", "scarpe cinque"), row("r6", "scarpe sei")];
const PAGING = { page: 1, totalPages: 1, start: 1, end: 3, total: 3 };
const CHIPS = { all: 1234, questions: 0, buy: 0, local: 0, brands: 0 };

function board(kept: KeywordRowData[], keptFiltered: number) {
  return (
    <KeywordsBoard
      projectId="p1"
      topic={{ id: "s1", name: "Scarpe" }}
      kept={kept}
      discarded={[]}
      counts={{ found: keptFiltered, keptTotal: keptFiltered, keptFiltered, discardedFiltered: 0 }}
      keptPaging={PAGING}
      discardedPaging={{ ...PAGING, end: 0, total: 0 }}
      chipCounts={CHIPS}
      sort="promising"
      filterParams={{ searchText: "scarpe" }}
    />
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  router.refresh.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, updated: 1 }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("KeywordsBoard, azioni sul set filtrato", () => {
  // covers: AC-803-3
  it("«Scarta queste 1234» invia la PATCH con i filtri della vista e lo stato tenute, senza ids", async () => {
    renderWithIntl(board(FIRST_PAGE, 1234));

    fireEvent.click(screen.getByRole("button", { name: "Scarta queste 1234" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(url).toBe("/api/projects/p1/results");
    expect(init?.method).toBe("PATCH");
    expect(body).toEqual({ action: "discard", filters: { searchText: "scarpe", status: "kept" }, subprojectId: "s1" });
    expect(body).not.toHaveProperty("ids");
  });

  // covers: AC-803-4
  it("al cambio di pagina l'elenco riparte dalle righe ricevute", async () => {
    const { rerender } = renderWithIntl(board(FIRST_PAGE, 6));
    const kept = () => screen.getByRole("table", { name: "Keyword tenute" });

    fireEvent.click(within(kept()).getByRole("button", { name: "Scarta scarpe uno" }));
    expect(within(kept()).queryByText("scarpe uno")).toBeNull();
    expect(screen.getByText(/5 tenute/)).toBeInTheDocument();
    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());

    rerender(board(SECOND_PAGE, 6));

    expect(within(kept()).getAllByRole("row")).toHaveLength(4);
    expect(within(kept()).getByText("scarpe quattro")).toBeInTheDocument();
    expect(screen.getByText(/6 tenute/)).toBeInTheDocument();
  });
});
