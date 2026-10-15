// Gate di T-2901 (AC-2901-1…3): le preferenze dell'account si salvano a ogni scelta, senza pulsante Salva, con l'esito
// in un elemento role status o role alert; la lingua si sceglie anche qui con la richiesta del selettore del menu.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalizationSettingsCard } from "@/components/personalization-settings-card";
import { renderWithIntl } from "./intl";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const fetchMock = vi.fn<typeof fetch>();

const INITIAL = { themeMode: "DARK", fontScaleMode: "NORMAL", colorVisionMode: "NONE" } as const;

function sentRequests() {
  return fetchMock.mock.calls.map(([url, init]) => ({ url, method: init?.method, body: JSON.parse(String(init?.body)) }));
}

beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preferenze salvate a ogni scelta", () => {
  // covers: AC-2901-1
  it("scelto Chiaro invia il solo tema, mostra Salvato e non c'è un pulsante Salva", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { ...INITIAL, themeMode: "LIGHT" } }));
    renderWithIntl(<PersonalizationSettingsCard initial={INITIAL} />);

    fireEvent.click(screen.getByRole("button", { name: "Chiaro" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Salvato");
    expect(sentRequests()).toEqual([{ url: "/api/user/preferences", method: "PATCH", body: { themeMode: "LIGHT" } }]);
    expect(screen.queryByRole("button", { name: /Salva/ })).toBeNull();
  });

  // covers: AC-2901-2
  it("con una risposta 500 il testo più grande torna non selezionato e l'errore è in un elemento role alert", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "boom" }, { status: 500 }));
    renderWithIntl(<PersonalizationSettingsCard initial={INITIAL} />);

    const largeText = screen.getByRole("checkbox");
    fireEvent.click(largeText);

    expect(await screen.findByRole("alert")).toHaveTextContent("Errore imprevisto (HTTP 500).");
    await waitFor(() => expect(largeText).not.toBeChecked());
    expect(screen.queryByRole("status")).toBeNull();
  });

  // covers: AC-2901-3
  it("scelto English invia la lingua con POST /api/locale", async () => {
    fetchMock.mockResolvedValue(Response.json({ success: true }));
    renderWithIntl(<PersonalizationSettingsCard initial={INITIAL} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Lingua" }), { target: { value: "en" } });

    expect(await screen.findByRole("status")).toHaveTextContent("Salvato");
    expect(sentRequests()).toEqual([{ url: "/api/locale", method: "POST", body: { locale: "en" } }]);
  });
});
