// Gate di T-3701 (AC-3701-4, D-44): il modulo dell'avvio rapido spiega come scrivere più idee e, oltre le 5 voci,
// mostra l'errore sotto il campo senza inviare la richiesta.
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickStartForm } from "@/components/quick-start-form";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const fetchMock = vi.fn<typeof fetch>();
const TARGETING = { languageCode: "it", countryCode: "IT" };

beforeEach(() => {
  fetchMock.mockReset();
  router.push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("QuickStartForm", () => {
  // covers: AC-3701-4
  it("con 6 voci mostra l'errore delle 5 voci sotto il campo e non chiama il fetch; il testo d'aiuto è visibile", async () => {
    renderWithIntl(<QuickStartForm variant="compact" targeting={TARGETING} />);

    const field = screen.getByLabelText("Nuovo progetto: di cosa parla il sito?");
    expect(field).toHaveAttribute("placeholder", "es. scarpe running, scarpe trail");
    const help = screen.getByText(/1-3 parole per idea/);
    expect(help).toHaveTextContent("1-3 parole per idea; più idee separate da virgola (fino a 5)");
    expect(field).toHaveAttribute("aria-describedby", help.id);

    fireEvent.change(field, { target: { value: "uno, due, tre, quattro, cinque, sei" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Trova le keyword" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Puoi scrivere al massimo 5 idee separate da virgola.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("nella forma piena il testo d'aiuto è visibile e 5 voci partono con il topic scritto", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { projectId: "P", topicId: "T", jobId: "J", extraction: "started" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );
    renderWithIntl(<QuickStartForm variant="first" targeting={TARGETING} />);

    expect(screen.getByText(/1-3 parole per idea/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "uno, due, tre, quattro, cinque" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Trova le keyword" }));
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/projects/quick-start");
    expect(JSON.parse(String(init?.body))).toEqual({ topic: "uno, due, tre, quattro, cinque", languageCode: "it", countryCode: "IT" });
    expect(router.push).toHaveBeenCalledWith("/projects/P/keywords/T");
  });
});
