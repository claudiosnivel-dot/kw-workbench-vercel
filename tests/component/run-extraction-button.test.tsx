// Gate di T-305 (AC-305-3, AC-305-4): un avvio non riuscito mostra l'errore e non fa avanzare la pagina.
// impacted-by: T-1205 (l'avvio riuscito è un 202 seguito da JobProgress; una risposta 200 non è un job avviato)
// impacted-by: T-2306 (onboarding rimosso: AC-305-3 emendato sul pulsante di avvio dell'estrazione)
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunExtractionButton } from "@/components/run-extraction-button";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  router.refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RunExtractionButton", () => {
  // covers: AC-305-3
  it("con risposta 500 JOB_FAILED mostra l'errore, nessun avanzamento e nessun aggiornamento della pagina", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: "Estrazione non riuscita", code: "JOB_FAILED" }));
    renderWithIntl(<RunExtractionButton projectId="p1" subprojectId="s1" resultsHref="/projects/p1/results?subprojectId=s1" />);

    fireEvent.click(screen.getByRole("button", { name: "Avvia estrazione" }));

    expect(await screen.findByText("Estrazione non riuscita")).toBeVisible();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  // covers: AC-305-4
  it("con risposta 200 e data.status failed mostra l'errore e non aggiorna la pagina", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { status: "failed" } }));
    renderWithIntl(<RunExtractionButton projectId="p1" resultsHref="/projects/p1/results?subprojectId=s1" />);

    fireEvent.click(screen.getByRole("button", { name: "Avvia estrazione" }));

    expect(await screen.findByText("Estrazione non riuscita")).toBeVisible();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
