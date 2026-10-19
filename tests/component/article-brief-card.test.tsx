// Gate di T-4001 (AC-4001-3): nelle impostazioni del progetto il blocco «Per gli articoli» è modificabile per chi ha
// project.update, con il contatore dei caratteri e la riga su OpenRouter, e in sola lettura per chi non lo ha.
// Emendamento dichiarato: i ruoli del workspace sono OWNER, ADMIN e MEMBER e tutti hanno project.update (D-08); il
// «VIEWER» del criterio è un utente senza project.update, reso con la stessa prop che la pagina calcola con canPerform.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectSettingsForm } from "@/components/project-form";
import { canPerform } from "@/lib/authz/permissions";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const fetchMock = vi.fn<typeof fetch>();

const VALUES = {
  name: "Letti ospedalieri",
  language_code: "it",
  country_code: "IT",
  autocomplete_provider: "GOOGLE_DIRECT" as const,
  metrics_provider: "NONE" as const,
  min_volume: 0,
  exclude_brands: true,
  expand_alpha: true,
  expand_numeric: true,
  expand_patterns: true,
  auto_classification: true,
  scoring_profile: "balanced",
};

const BRIEF = {
  article_about: "Noleggio",
  article_audience: "",
  article_tone: "professional" as const,
  business_name: "",
  business_address: "",
  site_url: "",
};

const OPEN_ROUTER_LINE = "Questi testi vanno a OpenRouter insieme alle keyword quando generi un articolo.";

function renderSettings(canEditArticleBrief: boolean) {
  return renderWithIntl(
    <ProjectSettingsForm
      projectId="P"
      initialValues={VALUES}
      initialArticleBrief={BRIEF}
      canEditAutocompleteProvider={false}
      canEditArticleBrief={canEditArticleBrief}
      brands={null}
    />
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("blocco «Per gli articoli» delle impostazioni del progetto", () => {
  // covers: AC-4001-3
  it("per l'OWNER i sei campi sono modificabili, con il contatore e la riga su OpenRouter, e Salva li invia", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: { id: "P" } }));
    renderSettings(canPerform("OWNER", "project.update"));

    expect(screen.getByRole("heading", { name: "Per gli articoli" })).toBeVisible();
    expect(screen.getByText(OPEN_ROUTER_LINE)).toBeVisible();
    const about = screen.getByLabelText("Chi siete e cosa offrite");
    expect(about).not.toHaveAttribute("readonly");
    expect(screen.getByText("8 su 1000 caratteri")).toBeVisible();
    for (const label of ["A chi vi rivolgete", "Nome dell'attività (facoltativo)", "Indirizzo dell'attività (facoltativo)", "Indirizzo del sito"]) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute("readonly");
    }
    expect(screen.getByLabelText("Tono")).toBeEnabled();

    fireEvent.change(about, { target: { value: "Noleggio letti ospedalieri a Roma" } });
    fireEvent.change(screen.getByLabelText("Tono"), { target: { value: "friendly" } });
    fireEvent.change(screen.getByLabelText("Indirizzo del sito"), { target: { value: "https://www.esempio.it/" } });
    expect(screen.getByText("33 su 1000 caratteri")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Salva le impostazioni" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/projects/P");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      article_about: "Noleggio letti ospedalieri a Roma",
      article_tone: "friendly",
      site_url: "https://www.esempio.it/",
    });
  });

  // covers: AC-4001-3
  it("per un utente senza project.update i campi sono in sola lettura", () => {
    renderSettings(false);

    for (const label of [
      "Chi siete e cosa offrite",
      "A chi vi rivolgete",
      "Nome dell'attività (facoltativo)",
      "Indirizzo dell'attività (facoltativo)",
      "Indirizzo del sito",
    ]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("readonly");
    }
    expect(screen.getByLabelText("Tono")).toBeDisabled();
    expect(screen.getByLabelText("Chi siete e cosa offrite")).toHaveValue("Noleggio");
    expect(screen.getByText("Solo chi può modificare il progetto cambia questi testi.")).toBeVisible();
  });
});
