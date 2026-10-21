// Gate di T-4502 (AC-4502-3): con 2 segnaposto «[da verificare: …]» aperti, «Copia» apre la finestra con «2 dati da
// verificare» e gli appunti non cambiano finché l'utente non clicca «Continua lo stesso». In più la copia diretta senza
// segnaposto con l'HTML e il Markdown dell'export, «Segna come pubblicata» con l'indirizzo precompilato e «Invia a
// WordPress» (T-4602) con la stessa conferma, il link alla bozza e «Aggiorna la bozza su WordPress».
import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleEditor } from "@/components/article/article-editor";
import type { ArticleView } from "@/lib/articles/view";
import type { ArticleEditorData } from "@/lib/articles/editor-data";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const fetchMock = vi.fn<typeof fetch>();
const write = vi.fn<(items: unknown[]) => Promise<void>>();
const writeText = vi.fn<(text: string) => Promise<void>>();

/** ClipboardItem del browser: tiene i tipi e le Promise dei contenuti. */
class FakeClipboardItem {
  constructor(readonly items: Record<string, Promise<Blob>>) {}
}

const PLACEHOLDER_ONE = "[da verificare: prezzo medio]";
const PLACEHOLDER_TWO = "[da verificare: anno della legge]";
const BODY = `Un letto costa ${PLACEHOLDER_ONE} al mese e la legge è del ${PLACEHOLDER_TWO}.`;

function article(withPlaceholders: boolean): ArticleView {
  const start = BODY.indexOf(PLACEHOLDER_ONE);
  const second = BODY.indexOf(PLACEHOLDER_TWO);
  const matches = withPlaceholders
    ? [
        { kind: "to_verify", rule: "placeholder", start, end: start + PLACEHOLDER_ONE.length },
        { kind: "to_verify", rule: "placeholder", start: second, end: second + PLACEHOLDER_TWO.length },
      ]
    : [];
  return {
    id: "a1",
    pageId: "pg1",
    status: "READY",
    length: "MEDIUM",
    notes: null,
    errorCode: null,
    metaTitle: "Letto elettrico a noleggio",
    metaDescription: "Come noleggiare un letto elettrico.",
    slug: "letto-elettrico-noleggio",
    outline: null,
    images: [],
    seoReport: null,
    version: 2,
    createdAt: "2026-10-20T08:00:00.000Z",
    updatedAt: "2026-10-20T08:05:00.000Z",
    sections: [
      {
        id: "s0",
        position: 0,
        kind: "INTRO",
        heading: null,
        body: withPlaceholders ? BODY : "Un letto elettrico si noleggia per settimane o mesi.",
        checks: { version: 1, matches, words: 14, score: 0, overLimit: false, problems: [], rewritten: false },
        edited: false,
        model: "autore/modello:free",
        updatedAt: "2026-10-20T08:05:00.000Z",
      },
    ],
    run: null,
  };
}

const NOT_CONNECTED: ArticleEditorData["publication"]["wordpress"] = { configured: false, postId: null, postUrl: null };

function renderEditor(withPlaceholders: boolean, wordpress = NOT_CONNECTED) {
  return renderWithIntl(
    <ArticleEditor
      projectId="P"
      strategyId="S"
      page={{ id: "pg1", h1: "Letto elettrico a noleggio", kind: "SPOKE", contentType: "guide", h2Count: 1, mainKeyword: "letto elettrico noleggio" }}
      pages={{ pg1: "Letto elettrico a noleggio" }}
      article={article(withPlaceholders)}
      canEdit
      canStart={false}
      publication={{ strategyVersion: 7, status: "WRITING", publishedUrl: null, siteUrl: "https://www.esempio.it", wordpress }}
    />
  );
}

const exportResponse = (url: string) =>
  new Response(url.includes("format=html") ? "<h1>Letto elettrico a noleggio</h1>" : "# Letto elettrico a noleggio\n", { status: 200 });

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => exportResponse(String(input)));
  write.mockReset();
  write.mockResolvedValue(undefined);
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("ClipboardItem", FakeClipboardItem);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write, writeText } });
  return () => vi.unstubAllGlobals();
});

async function copiedItem(): Promise<Record<string, string>> {
  const [item] = write.mock.calls[0][0] as FakeClipboardItem[];
  const entries = await Promise.all(Object.entries(item.items).map(async ([type, blob]) => [type, await (await blob).text()] as const));
  return Object.fromEntries(entries);
}

describe("conferma dei segnaposto prima della copia", () => {
  // covers: AC-4502-3
  it("con 2 segnaposto «Copia» apre la finestra con «2 dati da verificare» e gli appunti cambiano solo con «Continua lo stesso»", async () => {
    renderEditor(true);

    fireEvent.click(screen.getByRole("button", { name: "Copia" }));

    const dialog = screen.getByRole("dialog", { name: "Ci sono dati da verificare" });
    expect(within(dialog).getByText(/2 dati da verificare/)).toBeTruthy();
    expect(write).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Continua lo stesso" }));
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(write).toHaveBeenCalledTimes(1);
    expect(await copiedItem()).toEqual({ "text/html": "<h1>Letto elettrico a noleggio</h1>", "text/plain": "# Letto elettrico a noleggio\n" });
    expect(fetchMock.mock.calls.map(([input]) => String(input)).sort()).toEqual([
      "/api/projects/P/strategies/S/pages/pg1/article/export?format=html",
      "/api/projects/P/strategies/S/pages/pg1/article/export?format=md",
    ]);
    expect(await screen.findByText("Articolo copiato: incollalo nel tuo sito.")).toBeTruthy();
  });

  it("«Torna al testo» chiude la finestra senza copiare; senza segnaposto «Copia» copia subito", async () => {
    const { unmount } = renderEditor(true);
    fireEvent.click(screen.getByRole("button", { name: "Copia" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Torna al testo" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(write).not.toHaveBeenCalled();
    unmount();

    renderEditor(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copia" }));
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe("«Segna come pubblicata»", () => {
  it("l'indirizzo è precompilato con il sito più lo slug e la PATCH della pagina porta la pagina a PUBLISHED", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ data: { version: 8 } }), { status: 200 }));
    renderEditor(false);

    fireEvent.click(screen.getByRole("button", { name: "Segna come pubblicata" }));
    const dialog = screen.getByRole("dialog", { name: "Segna come pubblicata" });
    const field = within(dialog).getByLabelText("Indirizzo della pagina") as HTMLInputElement;
    expect(field.value).toBe("https://www.esempio.it/letto-elettrico-noleggio/");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Salva" }));
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/projects/P/strategies/S/pages/pg1");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({
      version: 7,
      status: "PUBLISHED",
      publishedUrl: "https://www.esempio.it/letto-elettrico-noleggio/",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("link", { name: "https://www.esempio.it/letto-elettrico-noleggio/" }).getAttribute("href")).toBe(
      "https://www.esempio.it/letto-elettrico-noleggio/"
    );
    expect(screen.getByRole("button", { name: "Cambia l'indirizzo" })).toBeTruthy();
  });

  it("un indirizzo rifiutato dal server resta nella finestra con il testo del catalogo", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ error: "Modifica della pagina non valida", code: "VALIDATION_ERROR" }), { status: 400 })
    );
    renderEditor(false);

    fireEvent.click(screen.getByRole("button", { name: "Segna come pubblicata" }));
    const dialog = screen.getByRole("dialog", { name: "Segna come pubblicata" });
    fireEvent.change(within(dialog).getByLabelText("Indirizzo della pagina"), { target: { value: "ftp://esempio.it" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Salva" }));
    });

    expect(within(dialog).getByRole("alert").textContent).toBe("Scrivi un indirizzo https completo, fino a 500 caratteri.");
  });
});

describe("«Invia a WordPress»", () => {
  const CONNECTED = { configured: true, postId: null, postUrl: null };

  it("con i segnaposto chiede conferma, poi crea la bozza, mostra il link e diventa «Aggiorna la bozza su WordPress»", async () => {
    fetchMock.mockImplementation(async () => Response.json({ data: { postId: 57, postUrl: "https://blog.esempio.it/?p=57" } }));
    renderEditor(true, CONNECTED);

    fireEvent.click(screen.getByRole("button", { name: "Invia a WordPress" }));
    const dialog = screen.getByRole("dialog", { name: "Ci sono dati da verificare" });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Continua lo stesso" }));
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/projects/P/strategies/S/pages/pg1/article/wordpress");
    expect(init?.method).toBe("POST");
    expect(await screen.findByText("Bozza inviata a WordPress.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Bozza su WordPress" }).getAttribute("href")).toBe("https://blog.esempio.it/?p=57");
    expect(screen.getByRole("button", { name: "Aggiorna la bozza su WordPress" })).toBeTruthy();
  });

  it("senza collegamento il pulsante non c'è; un errore di WordPress mostra il testo del catalogo", async () => {
    const { unmount } = renderEditor(false);
    expect(screen.queryByRole("button", { name: "Invia a WordPress" })).toBeNull();
    unmount();

    fetchMock.mockImplementation(async () => Response.json({ error: "WordPress", code: "WP_AUTH_FAILED" }, { status: 502 }));
    renderEditor(false, { configured: true, postId: 57, postUrl: "https://blog.esempio.it/?p=57" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aggiorna la bozza su WordPress" }));
    });

    expect(screen.getByRole("alert").textContent).toBe("WordPress non ha accettato utente e password per le applicazioni: controllali e riprova.");
    expect(screen.getByRole("link", { name: "Bozza su WordPress" })).toBeTruthy();
  });
});
