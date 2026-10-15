// Gate di T-1805 (AC-1805-4, parte della barra): voce Supporto verso il modulo contatti nel menu dell'utente.
// Con T-1801: la barra degli anonimi ha solo prezzi, accesso, registrazione e lingua.
// Gate di T-2005 (AC-2005-1): voce Fatturazione verso /billing per chi ha billing.manage nel workspace attivo.
// impacted-by: T-2304 (AC-1805-4 e AC-2005-1 emendati: Supporto e Fatturazione sono voci del menu dell'utente)
// impacted-by: T-3103 (AC-2005-1 superato: la fatturazione è la sezione Piano del workspace e nessun menu ha /billing)
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopNav } from "@/components/top-nav";
import { renderWithIntl } from "./intl";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

/** Voci del menu dell'utente con il loro href, dopo averlo aperto dal pulsante con il nome. */
function menuLinks(name: string): (string | null)[][] {
  fireEvent.click(screen.getByRole("button", { name: `Menu di ${name}` }));
  return within(screen.getByRole("menu"))
    .getAllByRole("menuitem")
    .map((item) => [item.textContent, item.getAttribute("href")]);
}

describe("barra di navigazione", () => {
  // covers: AC-1805-4
  it("per l'utente autenticato il menu contiene la voce Supporto verso /it/contact", () => {
    navigation.pathname = "/";
    renderWithIntl(<TopNav brandName="Titan SEO" themeMode="DARK" user={{ displayName: "Utente", email: "utente@example.test" }} />);

    expect(menuLinks("Utente")).toContainEqual(["Supporto", "/it/contact"]);
  });

  it("per l'anonimo su una pagina pubblica mostra prezzi, accesso, registrazione e la lingua alternativa", () => {
    navigation.pathname = "/it/pricing";
    renderWithIntl(<TopNav brandName="Titan SEO" themeMode="DARK" user={null} />);

    const desktop = screen.getAllByRole("navigation")[0];
    const hrefs = within(desktop)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/it/pricing", "/login", "/register", "/en/pricing"]);
    expect(within(desktop).queryByRole("button", { name: /esci/i })).toBeNull();
  });

  // covers: AC-2005-1
  it("né il menu dell'OWNER del workspace attivo né quello del MEMBER contengono la voce /billing", () => {
    navigation.pathname = "/";
    const billingHrefs = (role: "OWNER" | "MEMBER") => {
      renderWithIntl(
        <TopNav
          brandName="Titan SEO"
          themeMode="DARK"
          user={{ displayName: role, email: `${role.toLowerCase()}@example.test` }}
          workspaces={[{ id: `ws-${role}`, name: "Squadra", isPersonal: false }]}
          activeWorkspaceId={`ws-${role}`}
        />
      );
      const hrefs = menuLinks(role)
        .map(([, href]) => href)
        .filter((href) => href === "/billing");
      cleanup();
      return hrefs;
    };

    expect(billingHrefs("OWNER")).toEqual([]);
    expect(billingHrefs("MEMBER")).toEqual([]);
  });
});
