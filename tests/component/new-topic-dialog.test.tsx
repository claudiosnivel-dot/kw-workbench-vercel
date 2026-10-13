// Gate di T-2303 (AC-2303-3): il dialogo Nuovo argomento crea l'argomento con le parole di partenza, avvia la sua
// ricerca e porta ai suoi risultati; un nome già usato mostra un messaggio sotto il campo.
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewTopicDialog } from "@/components/new-topic-dialog";
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
  router.push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NewTopicDialog", () => {
  // covers: AC-2303-3
  it("crea l'argomento con le parole di partenza, avvia la sua ricerca e porta ai suoi risultati", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input) === "/api/projects/P/subprojects"
        ? jsonResponse(201, { data: { id: "T" } })
        : jsonResponse(202, { data: { jobId: "J", status: "pending", phase: "expand" } })
    );
    renderWithIntl(<NewTopicDialog projectId="P" onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Di cosa parla l'argomento?"), { target: { value: "scarpe da trail" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi altre parole di partenza" }));
    fireEvent.change(screen.getByLabelText("Altre parole di partenza, una per riga"), { target: { value: "scarpe trail uomo" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Trova le keyword" }));
    });

    const [createUrl, createInit] = fetchMock.mock.calls[0];
    expect(createUrl).toBe("/api/projects/P/subprojects");
    expect(JSON.parse(String(createInit?.body))).toEqual({ name: "scarpe da trail", seeds: ["scarpe da trail", "scarpe trail uomo"] });
    const [runUrl, runInit] = fetchMock.mock.calls[1];
    expect(runUrl).toBe("/api/projects/P/subprojects/T/run");
    expect(runInit?.method).toBe("POST");
    // impacted-by: T-2403 (i risultati dell'argomento sono la pagina delle sue keyword)
    expect(router.push).toHaveBeenCalledWith("/projects/P/keywords/T");
  });

  it("con un nome già usato mostra il messaggio sotto il campo e non avvia nulla", async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: "Esiste già una sezione con questo nome", code: "SECTION_NAME_TAKEN" }));
    renderWithIntl(<NewTopicDialog projectId="P" onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Di cosa parla l'argomento?"), { target: { value: "scarpe" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Trova le keyword" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Esiste già un argomento con questo nome.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });
});
