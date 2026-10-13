// Gate di T-2404 (AC-2404-3): il dialogo delle parole di partenza invia la lista completa con la PATCH dell'argomento e
// poi avvia la ricerca dello stesso argomento.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopicSeedsDialog } from "@/components/topic-seeds-dialog";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TopicSeedsDialog", () => {
  // covers: AC-2404-3
  it("aggiunge una parola, ne toglie una e con Salva e cerca invia la PATCH e poi la rotta run dell'argomento", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "T" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { jobId: "J" } }), { status: 202 }));
    const onClose = vi.fn();
    renderWithIntl(<TopicSeedsDialog projectId="P" topicId="T" seeds={["scarpe running", "scarpe corsa"]} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("Aggiungi parole di partenza, una per riga"), {
      target: { value: "scarpe running donna" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Togli scarpe corsa" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva e cerca" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [patchUrl, patchInit] = fetchMock.mock.calls[0];
    const [runUrl, runInit] = fetchMock.mock.calls[1];
    expect(patchUrl).toBe("/api/projects/P/subprojects/T");
    expect(patchInit?.method).toBe("PATCH");
    expect(JSON.parse(String(patchInit?.body))).toEqual({ seeds: ["scarpe running", "scarpe running donna"] });
    expect(runUrl).toBe("/api/projects/P/subprojects/T/run");
    expect(runInit?.method).toBe("POST");
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
