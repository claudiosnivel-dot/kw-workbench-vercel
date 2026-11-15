// Gate di T-6802 (AC-6802-1…3, D-62): gli angoli da valutare nel piano. L'avviso in testa al piano conta gli angoli e
// ne cita le keyword, le schede e le righe con angoli hanno l'etichetta «N angoli»; nel pannello «Tienila come H2»
// invia keep_angle e toglie il riquadro, «Fanne una pagina» apre il foglio «Nuova pagina» che invia create_page e poi
// lascia il pannello sulla pagina nuova.
// Gate di T-6902 (AC-6902-1, AC-6902-2, D-62): il consiglio dell'AI nel riquadro dell'angolo (per intero nel primo, in
// una riga breve negli altri) prepara il foglio «Nuova pagina» con l'hub e l'H1 proposti e «Sposta in…» con la pagina
// consigliata; nessuna operazione parte finché l'utente non conferma.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanBoard } from "@/components/plan/plan-board";
import type { StrategyKeywordView, StrategyPageView, StrategyView } from "@/lib/modules/strategy/types";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/projects/p1/plan",
  useSearchParams: () => new URLSearchParams(),
}));

const fetchMock = vi.fn<typeof fetch>();
const OPERATIONS_URL = "/api/projects/p1/strategies/s1/operations";

const keyword = (id: string, text: string, volume: number | null, extra: Partial<StrategyKeywordView> = {}): StrategyKeywordView => ({
  id,
  keyword: text,
  canonical: text,
  role: "SECONDARY",
  volume,
  score: 50,
  isQuestion: false,
  angle: false,
  ...extra,
});

const page = (id: string, extra: Partial<StrategyPageView> & Pick<StrategyPageView, "h1" | "keywords">): StrategyPageView => ({
  id,
  kind: "SPOKE",
  hubPageId: "P",
  h2: [],
  h1Edited: false,
  h2Edited: false,
  contentType: "guide",
  priority: 0,
  position: 0,
  reason: { code: "SPOKE_SERP", params: { count: 1, faq: 0 } },
  status: "TODO",
  statusChangedAt: null,
  publishedUrl: null,
  aiProposal: null,
  ...extra,
});

const PILLAR = page("P", {
  kind: "HUB",
  hubPageId: null,
  h1: "Noleggio magnetoterapia: la guida pratica",
  reason: { code: "HUB_SERP", params: { keyword: "noleggio magnetoterapia", merged: 0, faq: 0 } },
  keywords: [
    keyword("k1", "noleggio magnetoterapia", 1600, { role: "MAIN" }),
    keyword("k2", "noleggio magnetoterapia spalla", null, { angle: true }),
    keyword("k3", "magnetoterapia notturna noleggio", 20, { angle: true }),
  ],
});

const SPOKE = page("S", {
  h1: "Noleggio magnetoterapia costo: modelli e prezzi",
  position: 1,
  keywords: [keyword("k4", "noleggio magnetoterapia costo", 390, { role: "MAIN" })],
});

function strategy(hubs: StrategyView["hubs"], version = 4): StrategyView {
  return {
    id: "s1",
    name: "Piano",
    mode: "AUTO",
    language: "it",
    createdAt: "2026-11-15T10:00:00.000Z",
    consideredCount: 4,
    assignedCount: 4,
    unassignedCount: 0,
    truncated: false,
    version,
    pageCount: hubs.reduce((sum, hub) => sum + 1 + hub.spokes.length, 0),
    projectId: "p1",
    settings: {},
    groupingSource: "SERP",
    groupingNotice: null,
    hubs,
    unassigned: [],
  };
}

const PLAN = strategy([{ pillar: PILLAR, spokes: [SPOKE] }]);

const board = (plan: StrategyView, view: "board" | "list" | null = "board") => (
  <PlanBoard projectId="p1" strategy={plan} group="hub" view={view} readOnly={false} aiTitlesAvailable={false} openPageId={null} />
);

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function openPillar() {
  fireEvent.click(screen.getByRole("button", { name: PILLAR.h1 }));
  return screen.getByRole("dialog", { name: PILLAR.h1 });
}

const sentOperation = () => {
  const [url, init] = fetchMock.mock.calls[0];
  expect([init?.method, String(url)]).toEqual(["POST", OPERATIONS_URL]);
  return JSON.parse(String(init?.body)) as unknown;
};

beforeEach(() => {
  fetchMock.mockReset();
  router.refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const SHOULDER_REASON = "Chi cerca «spalla» vuole sapere se la magnetoterapia serve per quella zona: è un'altra domanda.";

const DEDUCTIBLE = page("D", {
  h1: "Noleggio magnetoterapia detraibile: cosa sapere",
  position: 2,
  keywords: [keyword("k5", "noleggio magnetoterapia detraibile", 90, { role: "MAIN" })],
});

/** Piano con il consiglio dell'AI sui due angoli della pilastro: K (k2) farne una pagina, J (k3) spostarlo in D. */
const ADVISED = strategy([
  {
    pillar: {
      ...PILLAR,
      keywords: [
        PILLAR.keywords[0],
        {
          ...PILLAR.keywords[1],
          angleAdvice: {
            action: "page",
            pageId: "P",
            reason: SHOULDER_REASON,
            alternative: "Uniscila a «noleggio magnetoterapia ginocchio» in una pagina sulle zone del corpo.",
            h1: "Magnetoterapia alla spalla",
          },
        },
        { ...PILLAR.keywords[2], angleAdvice: { action: "move", pageId: "D", reason: "È la stessa domanda della detrazione.", alternative: null, h1: null } },
      ],
    },
    spokes: [SPOKE, DEDUCTIBLE],
  },
]);

describe("angoli da valutare nel piano", () => {
  // covers: AC-6802-1
  it("l'avviso conta gli angoli e cita le keyword; solo la scheda e la riga della pilastro hanno l'etichetta", () => {
    renderWithIntl(board(PLAN, null));

    const notice = screen.getByRole("region", { name: "2 angoli da valutare" });
    expect(notice).toHaveTextContent("«noleggio magnetoterapia spalla», «magnetoterapia notturna noleggio».");
    const [pillarCard, spokeCard] = screen.getAllByTestId("plan-card");
    expect(pillarCard).toHaveTextContent("2 angoli");
    expect(spokeCard).not.toHaveTextContent("angol");
    const [pillarRow, spokeRow] = screen.getAllByTestId("plan-row");
    expect(pillarRow).toHaveTextContent("2 angoli");
    expect(spokeRow).not.toHaveTextContent("angol");

    fireEvent.click(within(notice).getByRole("button", { name: "Vedi gli angoli" }));
    expect(screen.getByRole("dialog", { name: PILLAR.h1 })).toBeInTheDocument();
  });

  it("senza angoli o in una versione precedente non c'è l'avviso", () => {
    const plain = strategy([{ pillar: { ...PILLAR, keywords: PILLAR.keywords.map((item) => ({ ...item, angle: false })) }, spokes: [SPOKE] }]);
    const view = renderWithIntl(board(plain));
    expect(screen.queryByRole("region", { name: /angol/ })).toBeNull();

    view.rerender(<PlanBoard projectId="p1" strategy={PLAN} group="hub" view="list" readOnly aiTitlesAvailable={false} openPageId={null} />);
    expect(screen.queryByRole("region", { name: /angol/ })).toBeNull();
  });

  // covers: AC-6802-2
  it("«Tienila come H2» invia keep_angle con la version del piano e toglie l'etichetta alla keyword", async () => {
    fetchMock.mockResolvedValue(json(200, { data: { version: 5 } }));
    renderWithIntl(board(PLAN));
    const panel = openPillar();
    const box = within(panel).getByRole("region", { name: "Angolo da valutare: noleggio magnetoterapia spalla" });
    expect(box).toHaveTextContent("volume non disponibile");

    fireEvent.click(within(box).getByRole("button", { name: "Tienila come H2" }));

    await waitFor(() => expect(within(panel).queryByRole("region", { name: "Angolo da valutare: noleggio magnetoterapia spalla" })).toBeNull());
    expect(sentOperation()).toEqual({ version: 4, operation: { type: "keep_angle", keywordIds: ["k2"] } });
    expect(within(panel).getByRole("button", { name: "Sposta «noleggio magnetoterapia spalla» in un'altra pagina" })).toBeInTheDocument();
    expect(within(panel).getByRole("region", { name: "Angolo da valutare: magnetoterapia notturna noleggio" })).toBeInTheDocument();
  });

  // covers: AC-6802-3
  it("«Fanne una pagina» apre il foglio, «Crea la pagina» invia create_page e il pannello passa alla pagina nuova", async () => {
    fetchMock.mockResolvedValue(json(200, { data: { version: 5, pageId: "N" } }));
    const view = renderWithIntl(board(PLAN));
    const panel = openPillar();
    const box = within(panel).getByRole("region", { name: "Angolo da valutare: noleggio magnetoterapia spalla" });

    fireEvent.click(within(box).getByRole("button", { name: "Fanne una pagina" }));
    const sheet = screen.getByRole("dialog", { name: "Nuova pagina" });
    expect(within(sheet).getByLabelText("Sotto la pagina principale")).toHaveValue("P");
    expect(within(sheet).getByRole("group", { name: "Porta con te anche" })).toHaveTextContent("magnetoterapia notturna noleggio");
    fireEvent.change(within(sheet).getByLabelText("Titolo (H1)"), { target: { value: "Magnetoterapia alla spalla" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Crea la pagina" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nuova pagina" })).toBeNull());
    expect(sentOperation()).toEqual({
      version: 4,
      operation: { type: "create_page", keywordIds: ["k2"], hubPageId: "P", h1: "Magnetoterapia alla spalla", contentType: "guide" },
    });
    expect(router.refresh).toHaveBeenCalled();

    // Il piano ricaricato contiene la pagina nuova: il pannello passa a lei.
    const created = page("N", {
      h1: "Magnetoterapia alla spalla",
      h1Edited: true,
      position: 2,
      reason: { code: "MANUAL_PAGE", params: {} },
      keywords: [keyword("k2", "noleggio magnetoterapia spalla", null, { role: "MAIN" })],
    });
    const pillar = { ...PILLAR, keywords: PILLAR.keywords.filter((item) => item.id !== "k2") };
    view.rerender(board(strategy([{ pillar, spokes: [SPOKE, created] }], 5)));

    const next = screen.getByRole("dialog", { name: "Magnetoterapia alla spalla" });
    expect(next).toHaveTextContent("Pagina creata da te.");
    expect(within(next).getByLabelText("Titolo (H1)")).toHaveValue("Magnetoterapia alla spalla");
  });
});

describe("consiglio dell'AI sugli angoli", () => {
  // covers: AC-6902-1
  it("il riquadro mostra il consiglio con il motivo e il foglio parte dalla pilastro e dall'H1 proposti, senza operazioni", () => {
    renderWithIntl(board(ADVISED));
    const panel = openPillar();
    const box = within(panel).getByRole("region", { name: "Angolo da valutare: noleggio magnetoterapia spalla" });
    expect(box).toHaveTextContent("Consiglio dell'AI: fanne una pagina propria");
    expect(box).toHaveTextContent(SHOULDER_REASON);
    expect(box).toHaveTextContent("In alternativa: Uniscila a «noleggio magnetoterapia ginocchio» in una pagina sulle zone del corpo.");
    // L'altro angolo ha la sola riga breve con l'azione consigliata.
    const other = within(panel).getByRole("region", { name: "Angolo da valutare: magnetoterapia notturna noleggio" });
    expect(other).toHaveTextContent("AI: spostala in «3. Noleggio magnetoterapia detraibile: cosa sapere»");
    expect(other).not.toHaveTextContent("Consiglio dell'AI");
    expect(other).not.toHaveTextContent("È la stessa domanda della detrazione.");

    fireEvent.click(within(box).getByRole("button", { name: "Fanne una pagina" }));

    const sheet = screen.getByRole("dialog", { name: "Nuova pagina" });
    expect(within(sheet).getByLabelText("Sotto la pagina principale")).toHaveValue("P");
    const h1 = within(sheet).getByLabelText("Titolo (H1)");
    expect(h1).toHaveValue("Magnetoterapia alla spalla");
    expect(h1).toHaveAccessibleDescription("Proposto dall'AI · puoi cambiarlo");
    fireEvent.change(h1, { target: { value: "Magnetoterapia per la spalla" } });
    expect(h1).toHaveAccessibleDescription("Facoltativo: se lo lasci vuoto lo propone il piano.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // covers: AC-6902-2
  it("«Sposta in…» parte dalla pagina consigliata e «Sposta» invia move_keywords con quella pagina", async () => {
    fetchMock.mockResolvedValue(json(200, { data: { version: 5 } }));
    renderWithIntl(board(ADVISED));
    const panel = openPillar();
    const box = within(panel).getByRole("region", { name: "Angolo da valutare: magnetoterapia notturna noleggio" });

    fireEvent.click(within(box).getByRole("button", { name: "Sposta in…" }));

    const dialog = screen.getByRole("dialog", { name: "Sposta «magnetoterapia notturna noleggio» in un'altra pagina" });
    expect(within(dialog).getByLabelText("Pagina")).toHaveValue("D");
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Sposta" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentOperation()).toEqual({ version: 4, operation: { type: "move_keywords", keywordIds: ["k3"], targetPageId: "D" } });
  });

  it("senza consiglio «Sposta in…» parte dalla prima pagina e il foglio dall'H1 vuoto, come prima", () => {
    renderWithIntl(board(strategy([{ pillar: PILLAR, spokes: [SPOKE, DEDUCTIBLE] }])));
    const panel = openPillar();
    const box = within(panel).getByRole("region", { name: "Angolo da valutare: magnetoterapia notturna noleggio" });
    expect(box).not.toHaveTextContent("AI");

    fireEvent.click(within(box).getByRole("button", { name: "Sposta in…" }));
    expect(within(screen.getByRole("dialog", { name: /in un'altra pagina/ })).getByLabelText("Pagina")).toHaveValue("S");
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));

    fireEvent.click(within(box).getByRole("button", { name: "Fanne una pagina" }));
    expect(within(screen.getByRole("dialog", { name: "Nuova pagina" })).getByLabelText("Titolo (H1)")).toHaveValue("");
  });
});
