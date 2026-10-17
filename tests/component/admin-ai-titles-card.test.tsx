// Gate di T-3501 (AC-3501-4): card «Titoli con l'AI» delle Impostazioni con lo stato della chiave, le proposte delle
// ultime 24 ore e il salvataggio dell'interruttore e del modello.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiTitlesSettingsCard } from "@/components/admin-ai-titles-card";
import { renderWithIntl } from "./intl";

const fetchMock = vi.fn<typeof fetch>();

const initial = {
  enabled: false,
  model: "google/gemma-prova:free",
  platformDailyLimit: 45,
  workspaceDailyLimit: 10,
  keyConfigured: false,
  used24h: 3,
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
  it("mostra chiave e proposte, poi salva l'interruttore acceso e il modello con «Salvato»", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { ...initial, enabled: true, model: "autore/altro:free" } }));
    renderWithIntl(<AiTitlesSettingsCard initial={initial} />);

    expect(screen.getByText("Chiave configurata: no")).toBeVisible();
    expect(screen.getByText("Proposte nelle ultime 24 ore: 3 su 45")).toBeVisible();

    const toggle = screen.getByRole("switch", { name: "Funzione per gli utenti" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.change(screen.getByLabelText("Modello"), { target: { value: "autore/altro:free" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() => expect(screen.getByText("Salvato")).toBeVisible());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/ai-titles");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toMatchObject({ enabled: true, model: "autore/altro:free" });
  });
});
