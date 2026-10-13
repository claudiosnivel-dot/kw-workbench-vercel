// Gate di T-2302 (AC-2302-3): la barra del prossimo passo ha un solo pulsante; con build_plan genera la strategia in
// modalità automatica e porta alla sua pagina.
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextStepBar } from "@/components/next-step-bar";
import type { ProjectProgressData } from "@/lib/modules/next-step";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const search = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => search.params,
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  router.push.mockReset();
  search.params = new URLSearchParams();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const TOPIC = { id: "T1", name: "Scarpe running", keptCount: 34, totalCount: 40, seedCount: 1, activeJobId: null };

function progress(next: ProjectProgressData["next"]): Pick<ProjectProgressData, "next" | "keptCount" | "topics"> {
  return { next, keptCount: 34, topics: [TOPIC] };
}

describe("NextStepBar", () => {
  // covers: AC-2302-3
  it("con build_plan ha un solo pulsante che genera la strategia AUTO e porta alla sua pagina", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { id: "S" } }), { status: 201 }));
    renderWithIntl(<NextStepBar projectId="P" progress={progress({ kind: "build_plan" })} onAddTopic={vi.fn()} />);
    const bar = screen.getByRole("region", { name: "Prossimo passo" });

    expect(within(bar).getAllByRole("button")).toHaveLength(1);
    expect(bar).toHaveTextContent("34 keyword tenute sono pronte per diventare pagine.");
    await act(async () => {
      fireEvent.click(within(bar).getByRole("button", { name: "Costruisci il piano" }));
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/projects/P/strategies");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ mode: "AUTO" });
    expect(router.push).toHaveBeenCalledWith("/projects/P/strategy/S");
  });

  it("con add_topic il pulsante apre il dialogo; con un code nel parametro extraction mostra perché la ricerca non è partita", () => {
    const onAddTopic = vi.fn();
    search.params = new URLSearchParams({ extraction: "EMAIL_NOT_VERIFIED" });
    renderWithIntl(<NextStepBar projectId="P" progress={progress({ kind: "add_topic" })} onAddTopic={onAddTopic} />);

    fireEvent.click(screen.getByRole("button", { name: "Aggiungi un argomento" }));

    expect(onAddTopic).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(/^La ricerca non è partita: /);
  });
});
