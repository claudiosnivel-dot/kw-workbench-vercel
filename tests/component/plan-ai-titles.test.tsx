// Gate di T-3603 (AC-3603-1…4): «Migliora i titoli con l'AI» nel pannello della pagina del piano. La proposta arriva in
// una card con «Usa questi titoli» (PATCH dei titoli con la version, poi DELETE della proposta) e «Scarta» (solo il
// DELETE); il limite raggiunto mostra l'ora in cui la proposta torna disponibile; la proposta salvata compare
// all'apertura del pannello senza richieste. Con T-3802 (AC-3802-5) la card dice quanti H2 non sono stati tenuti.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PagePanel, type PagePanelProps } from "@/components/plan/page-panel";
import { PlanRequestsProvider } from "@/components/plan/plan-requests";
import { APP_TIME_ZONE } from "@/lib/i18n/locale";
import type { StrategyPageView } from "@/lib/modules/strategy/types";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const fetchMock = vi.fn<typeof fetch>();
const SUGGEST_URL = "/api/projects/p1/strategies/s1/pages/sp1/titles/suggest";
const PAGE_URL = "/api/projects/p1/strategies/s1/pages/sp1";
// impacted-by: T-3802 (la proposta porta droppedH2, gli H2 tenuti fuori oltre il massimo)
const PROPOSAL = {
  h1: "Scarpe running donna: come sceglierle",
  h2: ["Ammortizzazione e peso", "Taglie e calzata"],
  droppedH2: 0,
  model: "autore/modello-prova:free",
  createdAt: "2026-10-17T08:00:00.000Z",
};

const PAGE: StrategyPageView = {
  id: "sp1",
  kind: "SPOKE",
  hubPageId: "hub1",
  h1: "Scarpe running donna: guida completa",
  h2: ["Scarpe running donna ammortizzate"],
  h1Edited: false,
  h2Edited: false,
  contentType: "guide",
  priority: 2420,
  position: 1,
  reason: { code: "SPOKE_WORD", params: { word: "donna", faq: 0 } },
  status: "TODO",
  statusChangedAt: null,
  aiProposal: null,
  keywords: [
    { id: "k1", keyword: "scarpe running donna", canonical: "scarpe running donna", role: "MAIN", volume: 2100, score: 80, isQuestion: false },
  ],
};

const HUB: StrategyPageView = { ...PAGE, id: "hub1", kind: "HUB", hubPageId: null, h1: "Scarpe running: la guida pratica" };

function panel(overrides: Partial<PagePanelProps> = {}) {
  return (
    <PlanRequestsProvider projectId="p1" strategyId="s1" version={4}>
      <PagePanel page={PAGE} hub={HUB} links={[HUB.h1]} destinations={[]} readOnly={false} aiTitlesAvailable onClose={vi.fn()} {...overrides} />
    </PlanRequestsProvider>
  );
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Risposte simulate per metodo: la proposta, la PATCH della pagina e lo scarto. */
function routeFetch(responses: { suggest?: () => Response | Promise<Response> }) {
  fetchMock.mockImplementation(async (_url, init) => {
    if (init?.method === "POST") return (responses.suggest ?? (() => json(200, { data: PROPOSAL })))();
    if (init?.method === "PATCH") return json(200, { data: { version: 5 } });
    return new Response(null, { status: 204 });
  });
}

const calls = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${String(url)}`);

beforeEach(() => {
  fetchMock.mockReset();
  router.refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("titoli con l'AI nel pannello della pagina", () => {
  // covers: AC-3603-1
  it("mostra la proposta in una card e «Usa questi titoli» invia la PATCH con la version e poi il DELETE", async () => {
    let answer: (response: Response) => void = () => undefined;
    routeFetch({ suggest: () => new Promise<Response>((resolve) => (answer = resolve)) });
    renderWithIntl(panel());

    fireEvent.click(screen.getByRole("button", { name: "Migliora i titoli con l'AI" }));
    expect(screen.getByRole("button", { name: "Sto scrivendo i titoli…" })).toBeDisabled();
    answer(json(200, { data: PROPOSAL }));
    const card = await screen.findByRole("region", { name: "Proposta dell'AI" });
    expect(card).toHaveTextContent(PROPOSAL.h1);
    expect(within(card).getAllByRole("listitem").map((item) => item.textContent)).toEqual(PROPOSAL.h2);
    expect(card).toHaveTextContent("Modello: autore/modello-prova:free");

    fireEvent.click(within(card).getByRole("button", { name: "Usa questi titoli" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "Proposta dell'AI" })).toBeNull());
    expect(calls()).toEqual([`POST ${SUGGEST_URL}`, `PATCH ${PAGE_URL}`, `DELETE ${SUGGEST_URL}`]);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ version: 4, h1: PROPOSAL.h1, h2: PROPOSAL.h2 });
    expect(screen.getByLabelText("Titolo (H1)")).toHaveValue(PROPOSAL.h1);
    expect(screen.getByLabelText("Titolo (H1)").parentElement).not.toHaveTextContent("suggerito");
  });

  // covers: AC-3603-2
  it("«Scarta» invia solo il DELETE, chiude la card e lascia i titoli di prima", async () => {
    routeFetch({});
    renderWithIntl(panel());

    fireEvent.click(screen.getByRole("button", { name: "Migliora i titoli con l'AI" }));
    const card = await screen.findByRole("region", { name: "Proposta dell'AI" });
    fireEvent.click(within(card).getByRole("button", { name: "Scarta" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "Proposta dell'AI" })).toBeNull());
    expect(calls()).toEqual([`POST ${SUGGEST_URL}`, `DELETE ${SUGGEST_URL}`]);
    expect(screen.getByLabelText("Titolo (H1)")).toHaveValue(PAGE.h1);
    expect(screen.getByLabelText("Scaletta (H2, una voce per riga)")).toHaveValue(PAGE.h2.join("\n"));
  });

  // covers: AC-3603-3
  it("con il limite raggiunto mostra l'ora in cui torna disponibile; senza la funzione il pulsante non c'è", async () => {
    routeFetch({ suggest: () => json(429, { code: "RATE_LIMITED", error: "Troppe richieste", retryAfter: 3600 }) });
    const time = () =>
      new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE }).format(Date.now() + 3_600_000);
    const expected = [time()];
    const view = renderWithIntl(panel());

    fireEvent.click(screen.getByRole("button", { name: "Migliora i titoli con l'AI" }));
    const alert = await screen.findByRole("alert");
    expected.push(time());

    expect(expected.map((value) => `Hai raggiunto il limite delle proposte: potrai chiederne un'altra dalle ${value}.`)).toContain(alert.textContent);
    expect(screen.queryByRole("region", { name: "Proposta dell'AI" })).toBeNull();

    view.rerender(panel({ aiTitlesAvailable: false }));
    expect(screen.queryByRole("button", { name: "Migliora i titoli con l'AI" })).toBeNull();
  });

  // covers: AC-3603-4
  it("la proposta salvata nella pagina compare all'apertura senza richieste", () => {
    const saved = { ...PROPOSAL, h1: "Scarpe running donna: guida", h2: ["Taglie e calzata"] };
    renderWithIntl(panel({ page: { ...PAGE, aiProposal: saved } }));

    const card = screen.getByRole("region", { name: "Proposta dell'AI" });
    expect(card).toHaveTextContent("Scarpe running donna: guida");
    expect(card).toHaveTextContent("Taglie e calzata");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un 409 STRATEGY_CONFLICT su «Usa questi titoli» mostra il messaggio e la card resta", async () => {
    fetchMock.mockImplementation(async (_url, init) =>
      init?.method === "PATCH" ? json(409, { code: "STRATEGY_CONFLICT", error: "conflict" }) : new Response(null, { status: 204 })
    );
    renderWithIntl(panel({ page: { ...PAGE, aiProposal: PROPOSAL } }));

    fireEvent.click(screen.getByRole("button", { name: "Usa questi titoli" }));

    const card = screen.getByRole("region", { name: "Proposta dell'AI" });
    await waitFor(() => expect(within(card).getByRole("alert")).toHaveTextContent("Il piano è stato modificato da un altro membro"));
    expect(calls()).toEqual([`PATCH ${PAGE_URL}`]);
  });

  // covers: AC-3802-5
  it("con H2 tenuti fuori la card dice quanti, senza la riga quando sono 0", async () => {
    const twelve = Array.from({ length: 12 }, (_, index) => `Argomento numero ${index + 1}`);
    routeFetch({ suggest: () => json(200, { data: { ...PROPOSAL, h2: twelve, droppedH2: 2 } }) });
    const view = renderWithIntl(panel());

    fireEvent.click(screen.getByRole("button", { name: "Migliora i titoli con l'AI" }));
    const card = await screen.findByRole("region", { name: "Proposta dell'AI" });

    expect(within(card).getAllByRole("listitem")).toHaveLength(12);
    expect(card).toHaveTextContent("Altri 2 titoli proposti non sono stati tenuti.");

    view.unmount();
    renderWithIntl(panel({ page: { ...PAGE, aiProposal: PROPOSAL } }));
    expect(screen.getByRole("region", { name: "Proposta dell'AI" })).not.toHaveTextContent("non sono stati tenuti");
  });
});
