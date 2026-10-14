// Gate di T-2702 (AC-2702-2) e di T-305 (AC-305-3, AC-305-4, emendati da T-2702): un avvio della ricerca non riuscito
// dal pulsante del prossimo passo mostra l'errore e non fa avanzare la pagina.
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextStepAction } from "@/components/next-step-action";
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
  router.refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function clickRunTopic(): Promise<void> {
  renderWithIntl(<NextStepAction projectId="P" next={{ kind: "run_topic", topicId: "T" }} onAddTopic={vi.fn()} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Avvia la ricerca" }));
  });
}

describe("NextStepAction con il passo run_topic", () => {
  // covers: AC-2702-2
  // covers: AC-305-3
  it("con risposta 500 JOB_FAILED mostra l'errore, nessun avanzamento e nessun cambio di pagina", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: "Estrazione non riuscita", code: "JOB_FAILED" }));

    await clickRunTopic();

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/P/subprojects/T/run", { method: "POST" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Estrazione non riuscita");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  // covers: AC-2702-2
  // covers: AC-305-4
  it("con risposta 200 e data.status failed mostra l'errore e non cambia pagina", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { status: "failed" } }));

    await clickRunTopic();

    expect(await screen.findByRole("alert")).toHaveTextContent("Estrazione non riuscita");
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
