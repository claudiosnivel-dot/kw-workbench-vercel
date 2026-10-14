// Gate di T-2701 (AC-2701-1, AC-2701-2): dal menu ⋯ di un argomento la voce «Nome e descrizione» apre il dialogo con
// il nome e la descrizione salvati; una descrizione cancellata arriva alla PATCH come null.
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopicActions } from "@/components/keywords/topic-actions";
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

// Azioni di un argomento con descrizione per un utente con section.write; il dialogo si apre dalla voce del menu ⋯.
function openTopicDialog() {
  renderWithIntl(
    <TopicActions
      projectId="P"
      topic={{ id: "T", name: "Running", description: "Scarpe da corsa", seeds: ["scarpe running"], overrides: NO_OVERRIDES }}
      canEdit
      canEditAutocompleteProvider={false}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Altre azioni per Running" }));
  const items = within(screen.getByRole("menu"))
    .getAllByRole("menuitem")
    .map((item) => item.textContent ?? "");
  fireEvent.click(screen.getByRole("menuitem", { name: "Nome e descrizione" }));
  return { items, dialog: screen.getByRole("dialog", { name: "Nome e descrizione" }) };
}

describe("dialogo Nome e descrizione dell'argomento", () => {
  // covers: AC-2701-1
  it("con la descrizione cancellata la PATCH invia { name: 'Running', description: null } e il dialogo si chiude", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "T" } }), { status: 200 }));
    const { dialog } = openTopicDialog();

    fireEvent.change(within(dialog).getByLabelText("Descrizione"), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salva" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/projects/P/subprojects/T");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ name: "Running", description: null });
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  // covers: AC-2701-2
  it("il menu non ha Rinomina e il dialogo mostra la descrizione salvata", () => {
    const { items, dialog } = openTopicDialog();

    expect(items).not.toContain("Rinomina");
    expect(items).toContain("Nome e descrizione");
    expect(within(dialog).getByLabelText("Nome dell'argomento")).toHaveValue("Running");
    expect(within(dialog).getByLabelText("Descrizione")).toHaveValue("Scarpe da corsa");
  });
});
