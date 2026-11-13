// Gate di T-1905 (AC-1905-3): il pannello delle impostazioni avanzate è chiuso alla prima resa, aperto mostra
// perimetro e regole e la generazione da pannello aperto invia la modalità esperta con le impostazioni scelte.
// impacted-by: T-2502 («Opzioni avanzate» e «Costruisci il piano» al posto di «Impostazioni avanzate» e «Genera
// strategia»; dopo la generazione il browser va al piano del progetto; con regenerate il corpo porta regenerate true).
// impacted-by: T-6201 e T-6202 (la POST avvia il lavoro di piano, 202 con runId: il browser va al piano quando la lettura
// dello stato dice completed)
// Gate di T-6303 (AC-6303-4): le regole del raggruppamento per risultati di Google, con il testo d'aiuto, vanno nel corpo.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrategySettings } from "@/components/strategy/strategy-settings";
import { DEFAULT_RULES, RULE_LIMITS } from "@/lib/modules/strategy/rules";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  router.push.mockReset();
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const completed = { id: "run-1", status: "completed", phase: "done", progress: { done: 1, total: 1 }, strategyId: "st1", errorCode: null };
  fetchMock.mockImplementation(async (url) =>
    String(url).endsWith("/strategies") ? json(202, { data: { runId: "run-1" } }) : json(200, { data: completed })
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderSettings() {
  renderWithIntl(
    <StrategySettings
      projectId="p1"
      sections={[
        { id: "s1", name: "Generale" },
        { id: "s2", name: "Blog" },
      ]}
      defaults={DEFAULT_RULES}
      limits={RULE_LIMITS}
    />
  );
}

function sentBody(): unknown {
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/projects/p1/strategies");
  expect(init?.method).toBe("POST");
  return JSON.parse(String(init?.body));
}

describe("StrategySettings", () => {
  // covers: AC-1905-3
  it("il pannello avanzato è chiuso, aperto mostra perimetro e regole e invia la modalità esperta", async () => {
    renderSettings();

    const toggle = screen.getByRole("button", { name: "Opzioni avanzate" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Perimetro")).toBeNull();
    expect(screen.queryByLabelText("Spoke massimi per hub")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Perimetro")).toBeVisible();
    expect(screen.getByLabelText("Keyword minime per uno spoke")).toHaveValue(DEFAULT_RULES.minKeywordsPerSpoke);
    expect(screen.getByLabelText("Spoke massimi per hub")).toHaveValue(DEFAULT_RULES.maxSpokesPerHub);

    fireEvent.change(screen.getByLabelText("Perimetro"), { target: { value: "s2" } });
    fireEvent.change(screen.getByLabelText("Keyword da includere"), { target: { value: "approved" } });
    fireEvent.click(screen.getByRole("button", { name: "Costruisci il piano" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/projects/p1/plan"));
    expect(sentBody()).toEqual({
      mode: "EXPERT",
      settings: {
        sectionId: "s2",
        reviewStatus: "approved",
        minVolume: null,
        searchIntent: null,
        keywordType: null,
        rules: DEFAULT_RULES,
      },
    });
  });

  // covers: AC-6303-4
  it("con «Risultati in comune per la stessa pagina» a 4 il corpo della richiesta ha rules.serpPageOverlap 4", async () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Opzioni avanzate" }));

    const pageOverlap = screen.getByLabelText("Risultati in comune per la stessa pagina");
    expect(pageOverlap).toHaveValue(DEFAULT_RULES.serpPageOverlap);
    expect(pageOverlap).toHaveAccessibleDescription(
      "Due keyword vanno nella stessa pagina se hanno almeno questo numero dei primi 10 risultati di Google in comune."
    );
    expect(screen.getByLabelText("Risultati in comune per lo stesso hub")).toHaveValue(DEFAULT_RULES.serpHubOverlap);
    fireEvent.change(pageOverlap, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Costruisci il piano" }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ mode: "EXPERT", settings: { rules: { ...DEFAULT_RULES, serpPageOverlap: 4 } } });
  });

  it("senza aprire il pannello invia la modalità automatica", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Costruisci il piano" }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(sentBody()).toEqual({ mode: "AUTO" });
  });

  it("nel dialogo Rigenera il piano invia regenerate true e torna al piano", async () => {
    renderWithIntl(
      <StrategySettings projectId="p1" sections={[]} defaults={DEFAULT_RULES} limits={RULE_LIMITS} regenerate onCancel={() => undefined} />
    );

    expect(screen.getByRole("button", { name: "Annulla" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Rigenera il piano" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/projects/p1/plan"));
    expect(sentBody()).toEqual({ mode: "AUTO", regenerate: true });
  });
});
