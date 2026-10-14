// Gate di T-2602 (AC-2602-2): il dialogo «Impostazioni diverse dal progetto» parte da «Come il progetto» e invia con la
// PATCH dell'argomento solo l'override scelto; ogni altro campo di override vale null.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopicOverridesDialog } from "@/components/topic-overrides-dialog";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const fetchMock = vi.fn<typeof fetch>();

const NO_OVERRIDES = {
  language_code_override: null,
  country_code_override: null,
  autocomplete_provider_override: null,
  metrics_provider_override: null,
  min_volume_override: null,
  exclude_brands_override: null,
  expand_alpha_override: null,
  expand_numeric_override: null,
  expand_patterns_override: null,
  auto_classification_override: null,
  scoring_profile_override: null,
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TopicOverridesDialog", () => {
  // covers: AC-2602-2
  it("con il volume minimo a 50 e il resto su Come il progetto invia solo min_volume_override 50", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "T" } }), { status: 200 }));
    const onClose = vi.fn();
    renderWithIntl(
      <TopicOverridesDialog
        projectId="P"
        topic={{ id: "T", name: "Running" }}
        overrides={NO_OVERRIDES}
        canEditAutocompleteProvider={false}
        onClose={onClose}
      />
    );

    expect(screen.getByLabelText("Profilo del punteggio")).toHaveDisplayValue("Come il progetto");
    fireEvent.change(screen.getByLabelText("Volume minimo"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const otherOverrides = Object.entries(body).filter(([key, value]) => key.endsWith("_override") && key !== "min_volume_override" && value !== null);
    expect(url).toBe("/api/projects/P/subprojects/T");
    expect(init?.method).toBe("PATCH");
    expect(body.min_volume_override).toBe(50);
    expect(otherOverrides).toEqual([]);
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
