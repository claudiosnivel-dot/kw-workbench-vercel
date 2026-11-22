// Gate di T-7602 (AC-7602-1, AC-7602-2, D-64): l'articolo importato da Claude Code mostra «Scritto da Claude Code»
// nell'editor e nel pannello della sua pagina, senza nomi di modello; la card «Claude Code» elenca le chiamate del
// registro con strumento, progetto, esito e durata e la spesa di oggi con il tetto. In più l'articolo delle AI di Titan
// SEO senza l'etichetta, la lista vuota e la spesa aggiornata dopo il salvataggio del tetto.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAgentKeyCard } from "@/components/admin-agent-key-card";
import { ArticleEditor } from "@/components/article/article-editor";
import { PagePanel } from "@/components/plan/page-panel";
import { PlanRequestsProvider } from "@/components/plan/plan-requests";
import type { ArticleView } from "@/lib/articles/view";
import type { AgentCallView } from "@/lib/modules/agent/key-types";
import type { StrategyPageView } from "@/lib/modules/strategy/types";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const fetchMock = vi.fn<typeof fetch>();
const MODEL = "autore/modello-prova:free";

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ARTICLE: ArticleView = {
  id: "a1",
  pageId: "pg1",
  status: "READY",
  source: "AGENT",
  length: "SHORT",
  notes: null,
  errorCode: null,
  metaTitle: "Noleggio magnetoterapia a casa",
  metaDescription: "Come funziona il noleggio della magnetoterapia a casa.",
  slug: "noleggio-magnetoterapia",
  outline: null,
  images: null,
  seoReport: { version: 1, density: 1.1, problems: [], blocks: [] },
  version: 3,
  createdAt: "2026-11-22T08:00:00.000Z",
  updatedAt: "2026-11-22T08:05:00.000Z",
  sections: [
    {
      id: "s0",
      position: 0,
      kind: "INTRO",
      heading: null,
      body: "Il noleggio della magnetoterapia porta l'apparecchio a casa.",
      checks: null,
      edited: false,
      model: null,
      updatedAt: "2026-11-22T08:05:00.000Z",
    },
    {
      // Un blocco riscritto poi da «Riscrivi questo blocco»: ha il modello, che resta nascosto.
      id: "s1",
      position: 1,
      kind: "H2",
      heading: "Come funziona",
      body: "Si sceglie la durata e si riceve l'apparecchio.",
      checks: null,
      edited: false,
      model: MODEL,
      updatedAt: "2026-11-22T08:05:00.000Z",
    },
  ],
  run: null,
};

const PAGE: StrategyPageView = {
  id: "pg1",
  kind: "HUB",
  hubPageId: null,
  h1: "Noleggio magnetoterapia a casa",
  h2: ["Come funziona"],
  h1Edited: false,
  h2Edited: false,
  contentType: "guide",
  priority: 900,
  position: 0,
  reason: { code: "HUB_SEED", params: {} },
  status: "WRITING",
  statusChangedAt: "2026-11-22T08:05:00.000Z",
  publishedUrl: null,
  aiProposal: null,
  keywords: [{ id: "k1", keyword: "noleggio magnetoterapia", canonical: "noleggio magnetoterapia", role: "MAIN", volume: 900, score: 80, isQuestion: false, angle: false }],
};

function renderEditor(article: ArticleView) {
  return renderWithIntl(
    <ArticleEditor
      projectId="P"
      strategyId="S"
      page={{ id: "pg1", h1: PAGE.h1, kind: "HUB", contentType: "guide", h2Count: 1, mainKeyword: "noleggio magnetoterapia" }}
      pages={{ pg1: PAGE.h1 }}
      article={article}
      canEdit
      canStart={false}
      publication={{ strategyVersion: 3, status: "WRITING", publishedUrl: null, siteUrl: null, wordpress: { configured: false, postId: null, postUrl: null } }}
    />
  );
}

function renderPanel(agent: boolean) {
  return renderWithIntl(
    <PlanRequestsProvider projectId="P" strategyId="S" version={3}>
      <PagePanel
        page={PAGE}
        hub={null}
        links={[]}
        destinations={[]}
        readOnly={false}
        aiTitlesAvailable={false}
        article={{ available: false, exists: true, agent }}
        onClose={vi.fn()}
      />
    </PlanRequestsProvider>
  );
}

const SPEND = { spentTodayUsd: 1.25, capUsd: 5 };

const CALLS: AgentCallView[] = [
  { id: "c3", at: "2026-11-22T09:15:00.000Z", tool: "edit_plan", project: { id: "p1", name: "Noleggio magnetoterapia" }, ok: false, errorCode: "AGENT_PAGE_LOCKED", durationMs: 180 },
  { id: "c2", at: "2026-11-22T09:10:00.000Z", tool: "build_plan", project: { id: "p1", name: "Noleggio magnetoterapia" }, ok: true, errorCode: null, durationMs: 2450 },
  { id: "c1", at: "2026-11-22T09:00:00.000Z", tool: "list_projects", project: null, ok: true, errorCode: null, durationMs: 40 },
];

const STATUS = { prefix: "AbCdEfGh", createdAt: "2026-11-20T10:00:00.000Z", expiresAt: null, lastUsedAt: "2026-11-22T09:15:00.000Z", revokedAt: null, active: true };

describe("articoli di Claude Code nell'editor e nel pannello", () => {
  // covers: AC-7602-1
  it("l'editor e il pannello della pagina di un articolo con source AGENT mostrano «Scritto da Claude Code» e nessun nome di modello", () => {
    const editor = renderEditor(ARTICLE);
    const header = screen.getAllByRole("status").find((element) => element.textContent?.includes("Pronto"));
    expect(header).toBeDefined();
    expect(within(header!).getByText("Scritto da Claude Code")).toBeVisible();
    expect(screen.queryByText(new RegExp(MODEL))).toBeNull();
    expect(document.body.textContent).not.toContain("autore/");
    expect(screen.getAllByRole("button", { name: "Modifica" })).toHaveLength(2);
    editor.unmount();

    renderPanel(true);
    expect(screen.getByRole("link", { name: "Apri l'articolo" })).toHaveAttribute("href", "/projects/P/plan/pages/pg1/article");
    expect(screen.getByText("Scritto da Claude Code")).toBeVisible();
    expect(document.body.textContent).not.toContain("autore/");
  });

  it("un articolo delle AI di Titan SEO non ha l'etichetta, né nell'editor né nel pannello", () => {
    const editor = renderEditor({ ...ARTICLE, source: "TITAN_AI" });
    expect(screen.queryByText("Scritto da Claude Code")).toBeNull();
    editor.unmount();

    renderPanel(false);
    expect(screen.getByRole("link", { name: "Apri l'articolo" })).toBeVisible();
    expect(screen.queryByText("Scritto da Claude Code")).toBeNull();
  });
});

describe("attività di Claude Code nella card", () => {
  // covers: AC-7602-2
  it("con tre chiamate, una AGENT_PAGE_LOCKED, e 1,25 $ spesi su un tetto di 5 $ elenca le tre righe e mostra «1,25 $ di 5 $ oggi»", () => {
    renderWithIntl(<AdminAgentKeyCard initial={STATUS} origin="https://titanseo.example" spend={SPEND} calls={CALLS} />);

    const activity = screen.getByTestId("agent-activity");
    expect(within(activity).getByRole("heading", { name: "Ultime chiamate" })).toBeVisible();
    expect(within(activity).getByText(/^1,25\s\$ di 5\s\$ oggi$/)).toBeVisible();
    const rows = within(within(activity).getByRole("list", { name: "Ultime chiamate" })).getAllByRole("listitem");
    expect(rows).toHaveLength(3);

    expect(rows[0]).toHaveTextContent("edit_plan");
    expect(within(rows[0]).getByRole("link", { name: "Noleggio magnetoterapia" })).toHaveAttribute("href", "/projects/p1");
    const locked = within(rows[0]).getByText("Errore: AGENT_PAGE_LOCKED");
    expect(locked).toHaveAttribute("data-outcome", "error");
    expect(locked).toHaveClass("text-red-700");
    expect(rows[0]).toHaveTextContent(/0,2\ss/);

    expect(rows[1]).toHaveTextContent("build_plan");
    expect(within(rows[1]).getByText("Riuscita")).toHaveAttribute("data-outcome", "ok");
    expect(rows[1]).toHaveTextContent(/2,5\ss/);

    expect(rows[2]).toHaveTextContent("list_projects");
    expect(within(rows[2]).getByText("Nessun progetto")).toBeVisible();
    expect(within(rows[2]).queryByRole("link")).toBeNull();
    expect(within(rows[2]).getByText("Riuscita")).toBeVisible();
  });

  it("senza chiamate dice «Nessuna chiamata»; dopo il salvataggio del tetto la spesa mostra il tetto nuovo", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { spentTodayUsd: 1.25, capUsd: 7.5 } }));
    renderWithIntl(<AdminAgentKeyCard initial={STATUS} origin="https://titanseo.example" spend={SPEND} calls={[]} />);

    const activity = screen.getByTestId("agent-activity");
    expect(within(activity).getByText("Nessuna chiamata")).toBeVisible();
    expect(within(activity).queryByRole("list")).toBeNull();

    fireEvent.change(screen.getByLabelText("Tetto giornaliero di spesa (dollari)"), { target: { value: "7.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva il tetto" }));

    await waitFor(() => expect(within(activity).getByText(/^1,25\s\$ di 7,50\s\$ oggi$/)).toBeVisible());
  });
});
