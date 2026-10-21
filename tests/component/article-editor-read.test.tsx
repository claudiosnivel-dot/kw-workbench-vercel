// Gate di T-4401 (AC-4401-2, AC-4401-3): l'editor dell'articolo evidenzia i tratti AI in giallo e i dati da verificare
// in arancio, «Copia prompt» copia il prompt del segnaposto immagine, e mentre il lavoro è attivo il polling ogni 3 s
// sostituisce «Sto scrivendo…» con il testo del blocco. In più i link interni verso le pagine del piano e l'errore del
// lavoro con il testo del catalogo.
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleEditor, type ArticleEditorProps } from "@/components/article/article-editor";
import type { ArticleView } from "@/lib/articles/view";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const fetchMock = vi.fn<typeof fetch>();
const writeText = vi.fn<(text: string) => Promise<void>>();

const INTRO = "In conclusione, la taglia giusta conta per chi corre.";
const SECOND = "Un paio costa 120 euro in negozio.";

const ARTICLE: ArticleView = {
  id: "a1",
  pageId: "pg1",
  status: "READY",
  length: "MEDIUM",
  notes: null,
  errorCode: null,
  metaTitle: "Scarpe running donna: come sceglierle",
  metaDescription: "Come scegliere le scarpe running da donna giuste.",
  slug: "scarpe-running-donna",
  outline: { model: "autore/modello:free", blocks: [] },
  images: [
    { position: 0, cover: true, purpose: "Copertina", alt: "Scarpe da corsa", fileName: "scarpe-running-donna.webp", aspectRatio: "16:9", prompt: "PROMPT ONE" },
    { position: 1, cover: false, purpose: "Taglie", alt: "Misura del piede", fileName: "scarpe-running-donna-2.webp", aspectRatio: "4:3", prompt: "PROMPT TWO" },
  ],
  seoReport: { version: 1, density: 1.2, problems: [], blocks: [] },
  version: 2,
  createdAt: "2026-10-20T08:00:00.000Z",
  updatedAt: "2026-10-20T08:05:00.000Z",
  sections: [
    {
      id: "s0",
      position: 0,
      kind: "INTRO",
      heading: null,
      body: INTRO,
      checks: { version: 1, matches: [{ kind: "ai_pattern", rule: "phrase", start: 0, end: 14 }], words: 9, score: 1, overLimit: false, problems: [], rewritten: false },
      edited: false,
      model: "autore/modello:free",
      updatedAt: "2026-10-20T08:05:00.000Z",
    },
    {
      id: "s1",
      position: 1,
      kind: "H2",
      heading: "Quanto costano",
      body: SECOND,
      checks: { version: 1, matches: [{ kind: "to_verify", rule: "amount", start: 14, end: 22 }], words: 7, score: 0, overLimit: false, problems: [], rewritten: false },
      edited: false,
      model: "autore/modello:free",
      updatedAt: "2026-10-20T08:05:00.000Z",
    },
  ],
  run: null,
};

function renderEditor(article: ArticleView = ARTICLE, overrides: Partial<ArticleEditorProps> = {}) {
  return renderWithIntl(
    <ArticleEditor
      projectId="P"
      strategyId="S"
      page={{ id: "pg1", h1: "Scarpe running donna: guida completa", kind: "SPOKE", contentType: "guide", h2Count: 1, mainKeyword: "scarpe running donna" }}
      pages={{ hub1: "Scarpe running: la guida pratica", pg1: "Scarpe running donna: guida completa" }}
      article={article}
      canEdit
      canStart
      publication={{ strategyVersion: 3, status: "WRITING", publishedUrl: null, siteUrl: null, wordpress: { configured: false, postId: null, postUrl: null } }}
      {...overrides}
    />
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("lettura dell'articolo nell'editor", () => {
  // covers: AC-4401-2
  it("evidenzia il tratto AI in giallo e il dato da verificare in arancio; «Copia prompt» copia il prompt del primo segnaposto", async () => {
    const { container } = renderEditor();

    const ai = container.querySelectorAll("mark.article-mark-ai");
    const verify = container.querySelectorAll("mark.article-mark-verify");
    expect(ai).toHaveLength(1);
    expect(ai[0]).toHaveTextContent("In conclusione");
    expect(ai[0]).toHaveAttribute("title", "Tratto tipico dei testi generati: formula fatta");
    expect(verify).toHaveLength(1);
    expect(verify[0]).toHaveTextContent("120 euro");
    expect(verify[0]).toHaveAttribute("title", "Da verificare: importo");
    expect(screen.getByRole("region", { name: "Introduzione" })).toHaveTextContent(INTRO);
    expect(screen.getByRole("region", { name: "Quanto costano" })).toHaveTextContent(SECOND);

    const placeholders = screen.getAllByRole("group", { name: /Segnaposto immagine/ });
    expect(placeholders).toHaveLength(2);
    expect(placeholders[0]).toHaveTextContent("scarpe-running-donna.webp");
    expect(placeholders[0]).toHaveTextContent("Scarpe da corsa");
    fireEvent.click(within(placeholders[0]).getByRole("button", { name: "Copia prompt" }));

    expect(writeText).toHaveBeenCalledWith("PROMPT ONE");
    expect(await within(placeholders[0]).findByText("Copiato")).toBeInTheDocument();
  });

  // covers: AC-4401-3
  it("con il lavoro attivo il blocco vuoto dice «Sto scrivendo…» e dopo il polling di 3 s mostra il suo testo", async () => {
    vi.useFakeTimers();
    const generating: ArticleView = {
      ...ARTICLE,
      status: "GENERATING",
      sections: [
        { ...ARTICLE.sections[0], body: "Testo dell'introduzione.", checks: null },
        { ...ARTICLE.sections[1], body: "", checks: null },
      ],
      run: { id: "r1", scope: "ARTICLE", sectionId: null, status: "running", phase: "sections", progress: { done: 2, total: 4 } },
    };
    const completed: ArticleView = {
      ...generating,
      status: "READY",
      sections: [generating.sections[0], { ...generating.sections[1], body: "Testo del secondo blocco." }],
      run: null,
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: completed }), { status: 200 }));
    renderEditor(generating);

    const second = screen.getByRole("region", { name: "Quanto costano" });
    expect(second).toHaveTextContent("Sto scrivendo…");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/P/strategies/S/pages/pg1/article", expect.objectContaining({ cache: "no-store" }));
    expect(second).toHaveTextContent("Testo del secondo blocco.");
    expect(second).not.toHaveTextContent("Sto scrivendo…");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("i link interni portano alla pagina del piano, gli altri restano testo", () => {
    const linked: ArticleView = {
      ...ARTICLE,
      sections: [{ ...ARTICLE.sections[0], body: "Leggi [la guida](page:hub1) e [questo](page:altro).", checks: null }, ARTICLE.sections[1]],
    };
    renderEditor(linked);

    const intro = screen.getByRole("region", { name: "Introduzione" });
    expect(within(intro).getByRole("link", { name: "la guida" })).toHaveAttribute("href", "/projects/P/plan?page=hub1");
    expect(within(intro).queryByRole("link", { name: "questo" })).toBeNull();
    expect(intro).toHaveTextContent("Leggi la guida e questo.");
  });

  it("un articolo non riuscito mostra il testo del catalogo del suo error_code", () => {
    renderEditor({ ...ARTICLE, status: "FAILED", errorCode: "AI_BUSY" });

    expect(screen.getByRole("alert")).toHaveTextContent("I modelli gratuiti sono tutti occupati");
  });
});
