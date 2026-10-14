// Gate di T-2505 (AC-2505-1…3): il pannello di una pagina del piano salva l'H1 dopo 800 ms senza digitare con la
// version corrente, dopo un 409 STRATEGY_CONFLICT ricarica il piano con il suo messaggio e nelle versioni precedenti è
// in sola lettura. Gate di T-1905 (AC-1905-4, emendato da T-2505): l'etichetta «suggerito» accompagna l'H1 non riscritto.
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PagePanel, type PagePanelProps } from "@/components/plan/page-panel";
import { PlanRequestsProvider } from "@/components/plan/plan-requests";
import type { StrategyPageView } from "@/lib/modules/strategy/types";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const fetchMock = vi.fn<typeof fetch>();

const PAGE: StrategyPageView = {
  id: "pg1",
  kind: "SPOKE",
  hubPageId: "hub1",
  h1: "Migliori scarpe running: classifica 2026",
  h2: ["Scarpe running recensioni", "Come abbiamo scelto"],
  h1Edited: false,
  h2Edited: false,
  contentType: "list",
  priority: 3290,
  position: 1,
  reason: { code: "SPOKE_MODIFIER", params: { category: "comparison", faq: 0 } },
  status: "TODO",
  statusChangedAt: null,
  keywords: [
    { id: "k1", keyword: "migliori scarpe running", canonical: "migliori scarpe running", role: "MAIN", volume: 2900, score: 80, isQuestion: false },
    { id: "k2", keyword: "scarpe running recensioni", canonical: "scarpe running recensioni", role: "SECONDARY", volume: 390, score: 60, isQuestion: false },
  ],
};

const HUB: StrategyPageView = { ...PAGE, id: "hub1", kind: "HUB", hubPageId: null, h1: "Scarpe running: la guida pratica" };

function renderPanel(overrides: Partial<PagePanelProps> = {}) {
  return renderWithIntl(
    <PlanRequestsProvider projectId="p1" strategyId="s1" version={4}>
      <PagePanel page={PAGE} hub={HUB} links={[HUB.h1]} destinations={[]} readOnly={false} onClose={vi.fn()} {...overrides} />
    </PlanRequestsProvider>
  );
}

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

beforeEach(() => {
  fetchMock.mockReset();
  router.refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PagePanel", () => {
  // covers: AC-2505-1
  it("dopo 800 ms senza digitare parte una sola PATCH con version 4 e il nuovo H1, poi Salvato senza «suggerito»", async () => {
    vi.useFakeTimers();
    respond(200, { data: { version: 5 } });
    renderPanel();
    const h1 = screen.getByLabelText("Titolo (H1)");
    expect(h1.parentElement).toHaveTextContent("suggerito");

    fireEvent.change(h1, { target: { value: "Le migliori scarpe da running" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(799);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/projects/p1/strategies/s1/pages/pg1");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ version: 4, h1: "Le migliori scarpe da running" });
    expect(screen.getByRole("status")).toHaveTextContent("Salvato");
    expect(screen.getByLabelText("Titolo (H1)").parentElement).not.toHaveTextContent("suggerito");
  });

  // covers: AC-2505-2
  it("con un 409 STRATEGY_CONFLICT dopo l'uscita dall'H2 richiede di nuovo il piano e mostra il messaggio", async () => {
    respond(409, { code: "STRATEGY_CONFLICT", error: "conflict" });
    renderPanel();
    const h2 = screen.getByLabelText("Scaletta (H2, una voce per riga)");

    fireEvent.change(h2, { target: { value: "Scarpe running recensioni\nOpinioni dei runner" } });
    fireEvent.blur(h2);

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      version: 4,
      h2: ["Scarpe running recensioni", "Opinioni dei runner"],
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Il piano è stato modificato da un altro membro: ho caricato l'ultima versione.");
  });

  // covers: AC-2505-3
  it("nella versione precedente non ci sono campi né il menu ⋯ e l'H1 è testo", () => {
    renderPanel({ readOnly: true });

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Altre azioni della pagina" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Sposta «/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: PAGE.h1 })).toBeVisible();
  });

  // covers: AC-1905-4
  it("l'etichetta «suggerito» accompagna l'H1 non riscritto e manca su quello riscritto", () => {
    const { unmount } = renderPanel();
    expect(screen.getByLabelText("Titolo (H1)").parentElement).toHaveTextContent("suggerito");
    unmount();

    renderPanel({ page: { ...PAGE, h1Edited: true, h2Edited: true } });
    expect(screen.queryByText("suggerito")).toBeNull();
  });
});
