// Gate di T-2604 (AC-2604-2): la pagina dell'argomento con tutte le colonne non mostra valori tecnici grezzi; fonti,
// intenti, tipi e stati del marchio passano dalle etichette dei cataloghi (una fonte senza etichetta compare come
// «Altra fonte»).
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordsBoard } from "@/components/keywords/keywords-board";
import { BrandStatus, KeywordType, SearchIntent } from "@/lib/generated/prisma/enums";
import { OPTIONAL_KEYWORD_COLUMNS } from "@/lib/modules/keywords-options";
import { toKeywordRow } from "@/lib/modules/keywords-page";
import { renderWithIntl } from "./intl";

// La pagina riceve le righe già lette: nessuna query in questo test.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/projects/p1/keywords/s1",
  useSearchParams: () => new URLSearchParams(),
}));

// Fonti scritte dalla pipeline più una fonte di un vecchio import senza etichetta.
const SOURCES = ["seed", "google-direct", "mock-autocomplete", "GOOGLE_AUTOCOMPLETE"];
const INTENTS = Object.values(SearchIntent);
const TYPES = Object.values(KeywordType);
const BRANDS = Object.values(BrandStatus);
const RAW_VALUES = [
  "GOOGLE_AUTOCOMPLETE",
  "commercial",
  "transactional",
  "navigational",
  "informational",
  "mixed",
  "allowed",
  "excluded",
  "pending",
  "approved",
  "rejected",
];

type SourceRow = Parameters<typeof toKeywordRow>[0];

/** Una keyword per ogni valore di fonte, intento, tipo e stato del marchio, ciclando sulle liste più corte. */
function rows() {
  const count = Math.max(SOURCES.length, INTENTS.length, TYPES.length, BRANDS.length);
  return Array.from({ length: count }, (_, index) =>
    toKeywordRow(
      {
        id: `k${index}`,
        keyword: `keyword ${index}`,
        subproject: { name: "Scarpe" },
        avg_monthly_searches: 100 + index,
        score: 50,
        competition: 0.5,
        is_question: false,
        is_local_intent: false,
        source: SOURCES[index % SOURCES.length],
        search_intent: INTENTS[index % INTENTS.length],
        keyword_type: TYPES[index % TYPES.length],
        brand_status: BRANDS[index % BRANDS.length],
        review_status: "pending",
      } as unknown as SourceRow,
      false
    )
  );
}

beforeEach(() => {
  window.localStorage.setItem("titan_keyword_columns", OPTIONAL_KEYWORD_COLUMNS.join(","));
});

afterEach(() => {
  window.localStorage.clear();
});

describe("etichette dell'elenco delle keyword", () => {
  // covers: AC-2604-2
  it("con tutte le colonne visibili il testo non contiene valori tecnici grezzi", () => {
    const kept = rows();
    const paging = { page: 1, totalPages: 1, start: 1, end: kept.length, total: kept.length };
    renderWithIntl(
      <KeywordsBoard
        projectId="p1"
        topic={{ id: "s1", name: "Scarpe" }}
        kept={kept}
        discarded={[]}
        counts={{ found: kept.length, keptTotal: kept.length, keptFiltered: kept.length, discardedFiltered: 0 }}
        keptPaging={paging}
        discardedPaging={{ ...paging, end: 0, total: 0 }}
        chipCounts={{ all: kept.length, questions: 0, buy: 0, local: 0, brands: 0 }}
        sort="promising"
        filterParams={{}}
      />
    );

    const text = document.body.textContent ?? "";
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(
      expect.arrayContaining(["Fonte", "Intento", "Tipo"])
    );
    expect(screen.getAllByText("Altra fonte").length).toBeGreaterThan(0);
    expect(RAW_VALUES.filter((value) => text.includes(value))).toEqual([]);
  });
});
