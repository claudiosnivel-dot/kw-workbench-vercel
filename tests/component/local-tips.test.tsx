// Gate di T-7001 (AC-7001-1…3, D-62): una pagina locale con almeno 15 keyword ha l'avviso in testa al piano e, nel suo
// pannello, i due consigli con «Scegli le città da scartare»; il dialogo scarta le città scelte con una sola richiesta
// all'azione in blocco dei risultati e avvisa che escono alla prossima «Rigenera». Con 14 keyword niente consigli.
// Gate di T-7002 (AC-7002-1): «Fanne una pagina» accanto a una città invia create_page con la città, l'hub della pagina
// locale e il tipo local, e poi il pannello passa alla pagina nuova.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanBoard } from "@/components/plan/plan-board";
import type { StrategyKeywordView, StrategyView } from "@/lib/modules/strategy/types";
import { renderWithIntl } from "./intl";
import { json, keyword, page, strategy } from "./plan-view";

const navigation = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  usePathname: () => "/projects/p1/plan",
  useSearchParams: () => new URLSearchParams(),
}));

const fetchMock = vi.fn<typeof fetch>();

const CITIES = ["roma", "milano", "napoli", "torino", "palermo", "genova", "bologna", "firenze", "bari", "catania", "verona", "padova", "trieste", "brescia", "parma"];
const LOCAL_H1 = "Noleggio magnetoterapia vicino a me: dove andare e cosa sapere";

/** Città della pagina locale: roma la più cercata, poi le altre in ordine; ogni città ha la sua riga dei risultati. */
const cities = (count: number): StrategyKeywordView[] =>
  CITIES.slice(0, count).map((city, index) =>
    keyword(`c-${city}`, `noleggio magnetoterapia ${city}`, 900 - index * 50, { sourceKeywordId: `src-${city}` })
  );

const HUB = page("H", {
  kind: "HUB",
  hubPageId: null,
  h1: "Noleggio magnetoterapia: la guida pratica",
  reason: { code: "HUB_SERP", params: { keyword: "noleggio magnetoterapia", merged: 0, faq: 0 } },
  keywords: [keyword("k-hub", "noleggio magnetoterapia", 1600, { role: "MAIN", sourceKeywordId: "src-hub" })],
});

/** Piano con l'hub H e la pagina locale sotto H: la principale «vicino a me» più cityCount città. */
function localPlan(cityCount: number, version = 4): StrategyView {
  const local = page("L", {
    hubPageId: "H",
    h1: LOCAL_H1,
    contentType: "local",
    position: 1,
    keywords: [keyword("k-near", "noleggio magnetoterapia vicino a me", 320, { role: "MAIN", sourceKeywordId: "src-near" }), ...cities(cityCount)],
  });
  return strategy([{ pillar: HUB, spokes: [local] }], version);
}

const board = (plan: StrategyView, readOnly = false) => (
  <PlanBoard projectId="p1" strategy={plan} group="hub" view="board" readOnly={readOnly} aiTitlesAvailable={false} openPageId={null} />
);

function openLocalPage() {
  fireEvent.click(screen.getByRole("button", { name: LOCAL_H1 }));
  return screen.getByRole("dialog", { name: LOCAL_H1 });
}

const request = (index = 0) => {
  const [url, init] = fetchMock.mock.calls[index];
  return { method: init?.method, url: String(url), body: JSON.parse(String(init?.body)) as unknown };
};

beforeEach(() => {
  fetchMock.mockReset();
  navigation.refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("consigli sulla pagina locale", () => {
  // covers: AC-7001-1
  it("con 16 keyword l'avviso conta le città e «Consigli» apre il pannello con i due consigli", () => {
    renderWithIntl(board(localPlan(15)));

    const notice = screen.getByRole("region", { name: "La pagina locale ha 16 città" });
    expect(notice).toHaveTextContent("Scegli tu quelle che contano.");
    fireEvent.click(within(notice).getByRole("button", { name: "Consigli" }));

    const panel = screen.getByRole("dialog", { name: LOCAL_H1 });
    const tips = within(panel).getByRole("region", { name: "16 città in una sola pagina" });
    expect(tips).toHaveTextContent("Lavori in una zona sola?");
    expect(tips).toHaveTextContent("Scarta le città dove non arrivi: escono dal piano alla prossima «Rigenera».");
    expect(tips).toHaveTextContent("Lavori in tutta Italia?");
    expect(tips).toHaveTextContent("Fai una pagina per le città dove hai sedi o clienti, 3–5 per iniziare. Le altre restano qui.");
    expect(within(tips).getByRole("button", { name: "Scegli le città da scartare" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // covers: AC-7001-2
  it("«Scarta le città scelte» invia una sola PATCH dei risultati con i tre source_keyword_id e il piano non cambia", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, updated: 3 }));
    renderWithIntl(board(localPlan(15)));
    const panel = openLocalPage();
    fireEvent.click(within(panel).getByRole("button", { name: "Scegli le città da scartare" }));

    const dialog = screen.getByRole("dialog", { name: "Scegli le città da scartare" });
    const discard = within(dialog).getByRole("button", { name: "Scarta le città scelte" });
    expect(discard).toBeDisabled();
    for (const city of ["napoli", "bari", "parma"]) fireEvent.click(within(dialog).getByRole("checkbox", { name: new RegExp(`magnetoterapia ${city}`) }));
    fireEvent.click(discard);

    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("Le città scartate escono dal piano alla prossima «Rigenera»."));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(request()).toEqual({
      method: "PATCH",
      url: "/api/projects/p1/results",
      body: { action: "discard", ids: ["src-napoli", "src-bari", "src-parma"] },
    });
    expect(within(dialog).getByRole("checkbox", { name: /magnetoterapia bari/ })).toBeDisabled();
    expect(within(dialog).getByRole("checkbox", { name: /magnetoterapia bari/ })).not.toBeChecked();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  // covers: AC-7001-3
  it("con 14 keyword non c'è l'avviso sulle città né il riquadro dei consigli nel pannello", () => {
    renderWithIntl(board(localPlan(13)));

    expect(screen.queryByRole("region", { name: /città/ })).toBeNull();
    const panel = openLocalPage();
    expect(within(panel).queryByRole("region", { name: /città in una sola pagina/ })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Scegli le città da scartare" })).toBeNull();
  });

  it("in una versione precedente non c'è l'avviso e il pannello non ha i consigli", () => {
    renderWithIntl(board(localPlan(15), true));

    expect(screen.queryByRole("region", { name: /città/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: LOCAL_H1 }));
    expect(within(screen.getByRole("dialog", { name: LOCAL_H1 })).queryByRole("region", { name: /città in una sola pagina/ })).toBeNull();
  });

  it("una keyword senza la sua riga dei risultati non si può scegliere; il dialogo ha «Fanne una pagina» per ogni città, non per la principale", () => {
    const plan = localPlan(15);
    const local = plan.hubs[0].spokes[0];
    local.keywords = local.keywords.map((item) => (item.id === "c-parma" ? { ...item, sourceKeywordId: null } : item));
    renderWithIntl(board(plan));
    fireEvent.click(within(openLocalPage()).getByRole("button", { name: "Scegli le città da scartare" }));

    const dialog = screen.getByRole("dialog", { name: "Scegli le città da scartare" });
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(16);
    expect(within(dialog).getByRole("checkbox", { name: /magnetoterapia parma/ })).toBeDisabled();
    expect(within(dialog).getByRole("checkbox", { name: /magnetoterapia parma/ }).closest("label")).toHaveTextContent("non si può scartare da qui");
    expect(within(dialog).getAllByRole("button", { name: /^Fanne una pagina per/ })).toHaveLength(15);
    expect(within(dialog).queryByRole("button", { name: "Fanne una pagina per «noleggio magnetoterapia vicino a me»" })).toBeNull();
  });
});

describe("«Fanne una pagina» accanto alle città", () => {
  // covers: AC-7002-1
  it("invia create_page con la città, l'hub della pagina locale e il tipo local; poi il pannello passa alla pagina nuova", async () => {
    fetchMock.mockResolvedValue(json(200, { data: { version: 5, pageId: "N" } }));
    const view = renderWithIntl(board(localPlan(15)));
    const tips = within(openLocalPage()).getByRole("region", { name: "16 città in una sola pagina" });
    // Le prime 5 città per volume hanno il pulsante nel riquadro.
    expect(within(tips).getAllByRole("button", { name: /^Fanne una pagina per/ }).map((button) => button.getAttribute("aria-label"))).toEqual(
      ["roma", "milano", "napoli", "torino", "palermo"].map((city) => `Fanne una pagina per «noleggio magnetoterapia ${city}»`)
    );
    expect(tips).toHaveTextContent("e altre 10 città");

    fireEvent.click(within(tips).getByRole("button", { name: "Fanne una pagina per «noleggio magnetoterapia roma»" }));

    await waitFor(() => expect(navigation.refresh).toHaveBeenCalled());
    expect(request()).toEqual({
      method: "POST",
      url: "/api/projects/p1/strategies/s1/operations",
      body: { version: 4, operation: { type: "create_page", keywordIds: ["c-roma"], hubPageId: "H", contentType: "local" } },
    });

    // Il piano ricaricato contiene la pagina nuova: il pannello passa a lei e la pagina locale perde la città.
    const plan = localPlan(15, 5);
    const local = { ...plan.hubs[0].spokes[0], keywords: plan.hubs[0].spokes[0].keywords.filter((item) => item.id !== "c-roma") };
    const created = page("N", {
      hubPageId: "H",
      h1: "Noleggio magnetoterapia roma: indirizzi e consigli in zona",
      contentType: "local",
      position: 2,
      reason: { code: "MANUAL_PAGE", params: {} },
      keywords: [keyword("c-roma", "noleggio magnetoterapia roma", 900, { role: "MAIN", sourceKeywordId: "src-roma" })],
    });
    view.rerender(board(strategy([{ pillar: HUB, spokes: [local, created] }], 5)));

    const next = screen.getByRole("dialog", { name: "Noleggio magnetoterapia roma: indirizzi e consigli in zona" });
    expect(next).toHaveTextContent("Pagina creata da te.");
    expect(screen.getByRole("region", { name: "La pagina locale ha 15 città" })).toBeInTheDocument();
  });

  it("dal dialogo «Fanne una pagina» chiude il dialogo dopo la risposta e lascia il messaggio se il piano è cambiato", async () => {
    fetchMock.mockResolvedValueOnce(json(409, { code: "STRATEGY_CONFLICT", error: "conflict" }));
    fetchMock.mockResolvedValueOnce(json(200, { data: { version: 6, pageId: "N" } }));
    renderWithIntl(board(localPlan(15)));
    fireEvent.click(within(openLocalPage()).getByRole("button", { name: "Scegli le città da scartare" }));
    const dialog = screen.getByRole("dialog", { name: "Scegli le città da scartare" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Fanne una pagina per «noleggio magnetoterapia parma»" }));
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("Il piano è stato modificato da un altro membro"));

    fireEvent.click(within(dialog).getByRole("button", { name: "Fanne una pagina per «noleggio magnetoterapia parma»" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Scegli le città da scartare" })).toBeNull());
    expect(request(1).body).toEqual({
      version: 4,
      operation: { type: "create_page", keywordIds: ["c-parma"], hubPageId: "H", contentType: "local" },
    });
  });
});
