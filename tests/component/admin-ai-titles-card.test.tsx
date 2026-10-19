// Gate di T-3501 (AC-3501-4): card «Titoli con l'AI» delle Impostazioni con lo stato della chiave, le proposte delle
// ultime 24 ore e il salvataggio dell'interruttore e dei modelli.
// impacted-by: T-3801 (elenco dei modelli con «Aggiungi modello» al posto del campo Modello: AC-3501-4 emendato)
// impacted-by: T-3902 («Richieste nelle ultime 24 ore» del tetto in richieste al posto delle proposte: AC-3501-4 emendato)
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiTitlesSettingsCard } from "@/components/admin-ai-titles-card";
import { renderWithIntl } from "./intl";

const fetchMock = vi.fn<typeof fetch>();

// impacted-by: T-4002 (interruttore e limiti degli articoli nella vista della card)
const initial = {
  enabled: false,
  models: ["google/gemma-prova:free"],
  platformDailyRequests: 900,
  workspaceDailyLimit: 10,
  articlesEnabled: false,
  articlesPerWorkspaceDaily: 3,
  sectionRewritesPerWorkspaceDaily: 20,
  keyConfigured: false,
  // Catalogo appena controllato: la card non lo rilegge all'apertura.
  catalog: { checkedAt: new Date().toISOString(), free: [{ id: "google/gemma-prova:free", name: "Gemma prova", contextLength: 8192 }] },
  statuses: { "google/gemma-prova:free": "ok" as const },
  addable: [],
  usage: { models: [], requests24h: 3, limit: 900 },
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("card dei titoli con l'AI", () => {
  // covers: AC-3501-4
  it("mostra chiave e richieste, poi salva l'interruttore acceso e il modello aggiunto con «Salvato»", async () => {
    const models = ["google/gemma-prova:free", "autore/altro:free"];
    fetchMock.mockResolvedValue(Response.json({ data: { ...initial, enabled: true, models } }));
    renderWithIntl(<AiTitlesSettingsCard initial={initial} />);

    expect(screen.getByText("Chiave configurata: no")).toBeVisible();
    expect(screen.getByText("Richieste nelle ultime 24 ore: 3 su 900")).toBeVisible();

    const toggle = screen.getByRole("switch", { name: "Funzione per gli utenti" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.change(screen.getByLabelText("Aggiungi modello"), { target: { value: "autore/altro:free" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() => expect(screen.getByText("Salvato")).toBeVisible());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/ai-titles");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toMatchObject({ enabled: true, models });
  });
});
