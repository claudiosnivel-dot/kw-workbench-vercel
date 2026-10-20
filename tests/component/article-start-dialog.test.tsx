// Gate di T-4401 (AC-4401-1): dal pannello di uno spoke con gli articoli accesi «Scrivi l'articolo con l'AI» apre la
// finestra con la lunghezza proposta Media; «Scrivi» invia la POST dell'articolo con length MEDIUM e apre l'editor. In
// più la lunghezza proposta per la pilastro e per le pagine locali, le note e «Apri l'articolo» con un articolo esistente.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

const SPOKE: StrategyPageView = {
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
  aiProposal: null,
  keywords: [
    { id: "k1", keyword: "migliori scarpe running", canonical: "migliori scarpe running", role: "MAIN", volume: 2900, score: 80, isQuestion: false },
  ],
};

const HUB: StrategyPageView = { ...SPOKE, id: "hub1", kind: "HUB", hubPageId: null, h1: "Scarpe running: la guida pratica", contentType: "guide" };

function renderPanel(page: StrategyPageView, overrides: Partial<PagePanelProps> = {}) {
  return renderWithIntl(
    <PlanRequestsProvider projectId="P" strategyId="S" version={4}>
      <PagePanel
        page={page}
        hub={page.kind === "SPOKE" ? HUB : null}
        links={[]}
        destinations={[]}
        readOnly={false}
        aiTitlesAvailable={false}
        article={{ available: true, exists: false }}
        onClose={vi.fn()}
        {...overrides}
      />
    </PlanRequestsProvider>
  );
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Scrivi l'articolo con l'AI" }));
  return screen.getByRole("dialog", { name: "Scrivi l'articolo con l'AI" });
}

beforeEach(() => {
  fetchMock.mockReset();
  router.push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("avvio dell'articolo dal pannello", () => {
  // covers: AC-4401-1
  it("propone Media per uno spoke, invia length MEDIUM e apre l'editor dell'articolo", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { articleId: "a1", runId: "r1" } }), { status: 202 }));
    renderPanel(SPOKE);

    const dialog = openDialog();
    expect(within(dialog).getByRole("radio", { name: /Media/ })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Breve/ })).not.toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Lunga/ })).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Scrivi" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/projects/P/plan/pages/pg1/article"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/projects/P/strategies/S/pages/pg1/article");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ length: "MEDIUM", notes: null });
  });

  it("propone Lunga per la pagina pilastro e Breve per una pagina locale; le note partono con la POST", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { articleId: "a1", runId: "r1" } }), { status: 202 }));
    const { unmount } = renderPanel(HUB);
    expect(within(openDialog()).getByRole("radio", { name: /Lunga/ })).toBeChecked();
    unmount();

    renderPanel({ ...SPOKE, contentType: "local" });
    const dialog = openDialog();
    expect(within(dialog).getByRole("radio", { name: /Breve/ })).toBeChecked();
    fireEvent.click(within(dialog).getByRole("radio", { name: /Lunga/ }));
    fireEvent.change(within(dialog).getByLabelText("Note per l'articolo (facoltative)"), { target: { value: "Cita il negozio di via Roma" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Scrivi" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ length: "LONG", notes: "Cita il negozio di via Roma" });
  });

  it("con un errore resta nella finestra con il messaggio del catalogo e non apre l'editor", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: "JOB_ALREADY_ACTIVE", error: "x" }), { status: 409 }));
    renderPanel(SPOKE);

    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Scrivi" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("C'è già un lavoro in corso per questo articolo");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("con un articolo esistente il pannello mostra «Apri l'articolo» verso l'editor", () => {
    renderPanel(SPOKE, { article: { available: true, exists: true } });

    expect(screen.getByRole("link", { name: "Apri l'articolo" })).toHaveAttribute("href", "/projects/P/plan/pages/pg1/article");
    expect(screen.queryByRole("button", { name: "Scrivi l'articolo con l'AI" })).toBeNull();
  });

  it("con gli articoli spenti e senza articolo non c'è nessuna voce dell'articolo", () => {
    renderPanel(SPOKE, { article: { available: false, exists: false } });

    expect(screen.queryByRole("button", { name: "Scrivi l'articolo con l'AI" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Apri l'articolo" })).toBeNull();
  });
});
