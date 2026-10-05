// Gate di T-908 (AC-908-3): la card della configurazione OAuth di Google Sheets aggiorna i dati dopo il
// salvataggio, mostra l'esito in un elemento role=status e rimuove un override inviando null.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleSheetsApiConfigCard } from "@/components/google-sheets-api-config-card";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const fetchMock = vi.fn<typeof fetch>();

const INITIAL = {
  clientId: "db-id.apps.googleusercontent.com",
  redirectUri: "https://app.example.com/api/integrations/google-sheets/callback",
  hasClientSecret: true,
  sources: { clientId: "db", clientSecret: "env", redirectUri: "env" },
} as const;

function sentBodies(): unknown[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
}

beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => Response.json({ data: INITIAL }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GoogleSheetsApiConfigCard", () => {
  // covers: AC-908-3
  it("dopo il salvataggio aggiorna la pagina e mostra l'esito; «Rimuovi override» invia null", async () => {
    render(<GoogleSheetsApiConfigCard initial={INITIAL} />);

    fireEvent.change(screen.getByLabelText("OAuth Client ID"), { target: { value: "nuovo-id.apps.googleusercontent.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva configurazione Google Sheets" }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent("Configurazione OAuth Google Sheets salvata.");

    fireEvent.click(screen.getByRole("button", { name: "Rimuovi override Client ID" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sentBodies()[1]).toEqual({ clientId: null });
  });
});
