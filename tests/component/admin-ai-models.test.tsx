// Gate di T-3801 (AC-3801-3): elenco ordinato dei modelli nella card «Titoli con l'AI», con «Su», «Giù», «Togli» e
// «Aggiungi modello»; con il catalogo di T-3803 lo stato di ogni modello, la data dell'ultimo controllo e i modelli
// gratuiti nuovi da aggiungere, e la rilettura del catalogo all'apertura quando ha più di un'ora.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiTitlesSettingsCard } from "@/components/admin-ai-titles-card";
import { renderWithIntl } from "./intl";

const fetchMock = vi.fn<typeof fetch>();
const MODELS = ["a/uno:free", "a/due:free", "a/tre:free"];

function view(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    models: MODELS,
    platformDailyLimit: 45,
    workspaceDailyLimit: 10,
    keyConfigured: true,
    used24h: 0,
    catalog: {
      checkedAt: new Date().toISOString(),
      free: [
        { id: "a/uno:free", name: "A: Uno", contextLength: 131072 },
        { id: "a/tre:free", name: "A: Tre", contextLength: 131072 },
        { id: "a/nuovo:free", name: "A: Nuovo", contextLength: 65536 },
      ],
    },
    statuses: {},
    addable: [],
    ...overrides,
  };
}

const modelRows = () => within(screen.getByRole("list", { name: "Modelli, dal primo da provare" })).getAllByRole("listitem");
const patchBody = () => JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]?.body)) as { models: string[] };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("elenco dei modelli nella card", () => {
  // covers: AC-3801-3
  it("«Giù» sul primo modello lo sposta al secondo posto e il salvataggio invia il nuovo ordine", async () => {
    fetchMock.mockImplementation(async (_url, init) => Response.json({ data: { ...view(), models: JSON.parse(String(init?.body)).models } }));
    renderWithIntl(<AiTitlesSettingsCard initial={view()} />);

    fireEvent.click(within(modelRows()[0]).getByRole("button", { name: "Giù" }));

    expect(modelRows().map((row) => row.textContent)).toEqual([
      expect.stringContaining("a/due:free"),
      expect.stringContaining("a/uno:free"),
      expect.stringContaining("a/tre:free"),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(screen.getByText("Salvato")).toBeVisible());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(patchBody().models).toEqual(["a/due:free", "a/uno:free", "a/tre:free"]);
  });

  it("mostra lo stato di ogni modello e la data del controllo; «Aggiungi» e «Togli» cambiano l'elenco inviato", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: view() }));
    renderWithIntl(<AiTitlesSettingsCard initial={view()} />);

    expect(modelRows().map((row) => within(row).getByText(/disponibile|non più nel catalogo|da verificare/).textContent)).toEqual([
      "disponibile",
      "non più nel catalogo",
      "disponibile",
    ]);
    expect(screen.getByText(/^Ultimo controllo del catalogo di OpenRouter: /)).toBeVisible();
    expect(within(modelRows()[0]).getByRole("button", { name: "Su" })).toBeDisabled();
    expect(within(modelRows()[2]).getByRole("button", { name: "Giù" })).toBeDisabled();

    const newModel = screen.getByText("a/nuovo:free").closest("li");
    fireEvent.click(within(newModel as HTMLElement).getByRole("button", { name: "Aggiungi" }));
    fireEvent.click(within(modelRows()[1]).getByRole("button", { name: "Togli" }));
    fireEvent.change(screen.getByLabelText("Aggiungi modello"), { target: { value: "a/pagamento" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Aggiungi" })[0]);

    expect(screen.getByRole("alert")).toHaveTextContent("Solo modelli gratuiti: un ID che finisce con :free.");
    expect(screen.getByText("Tutti i modelli gratuiti del catalogo sono già nell'elenco.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(screen.getByText("Salvato")).toBeVisible());
    expect(patchBody().models).toEqual(["a/uno:free", "a/tre:free", "a/nuovo:free"]);
  });

  it("all'apertura rilegge un catalogo mai controllato e mostra lo stato aggiornato", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: view() }));
    renderWithIntl(<AiTitlesSettingsCard initial={view({ catalog: null })} />);

    expect(screen.getByText("Catalogo di OpenRouter non ancora controllato")).toBeVisible();
    expect(within(modelRows()[0]).getByText("da verificare")).toBeVisible();

    await waitFor(() => expect(within(modelRows()[0]).getByText("disponibile")).toBeVisible());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/ai-titles/catalog");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  });
});
