// Gate di T-1905 (AC-1905-3): il pannello delle impostazioni avanzate è chiuso alla prima resa, aperto mostra
// perimetro e regole e la generazione da pannello aperto invia la modalità esperta con le impostazioni scelte.
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
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ data: { id: "st1" } }), { status: 201, headers: { "Content-Type": "application/json" } })
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

    const toggle = screen.getByRole("button", { name: "Impostazioni avanzate" });
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
    fireEvent.click(screen.getByRole("button", { name: "Genera strategia" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/projects/p1/strategy/st1"));
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

  it("senza aprire il pannello invia la modalità automatica", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Genera strategia" }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(sentBody()).toEqual({ mode: "AUTO" });
  });
});
