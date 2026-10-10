// Gate di T-1805 (AC-1805-4, parte della barra): link Supporto verso il modulo contatti nella barra dell'app.
// Con T-1801: la barra degli anonimi ha solo prezzi, accesso, registrazione e lingua.
// Gate di T-2005 (AC-2005-1): voce Fatturazione verso /billing per chi ha billing.manage nel workspace attivo.
import { cleanup, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopNav } from "@/components/top-nav";
import { canPerform } from "@/lib/authz/permissions";
import { renderWithIntl } from "./intl";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("barra di navigazione", () => {
  // covers: AC-1805-4
  it("per l'utente autenticato contiene il link Supporto verso /it/contact", () => {
    navigation.pathname = "/";
    renderWithIntl(<TopNav brandName="Seo God Mode" themeMode="DARK" user={{ displayName: "Utente", email: "utente@example.test" }} />);

    const desktop = screen.getAllByRole("navigation")[0];
    expect(within(desktop).getByRole("link", { name: "Supporto" })).toHaveAttribute("href", "/it/contact");
  });

  it("per l'anonimo su una pagina pubblica mostra prezzi, accesso, registrazione e la lingua alternativa", () => {
    navigation.pathname = "/it/pricing";
    renderWithIntl(<TopNav brandName="Seo God Mode" themeMode="DARK" user={null} />);

    const desktop = screen.getAllByRole("navigation")[0];
    const hrefs = within(desktop)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/it/pricing", "/login", "/register", "/en/pricing"]);
    expect(within(desktop).queryByRole("button", { name: /esci/i })).toBeNull();
  });

  // covers: AC-2005-1
  it("la barra dell'OWNER del workspace attivo contiene il link /billing, quella del MEMBER no", () => {
    navigation.pathname = "/";
    const billingHrefs = (role: "OWNER" | "MEMBER") => {
      renderWithIntl(
        <TopNav
          brandName="Seo God Mode"
          themeMode="DARK"
          user={{ displayName: role, email: `${role.toLowerCase()}@example.test` }}
          showBillingLink={canPerform(role, "billing.manage")}
        />
      );
      const desktop = screen.getAllByRole("navigation")[0];
      const hrefs = within(desktop)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"))
        .filter((href) => href === "/billing");
      cleanup();
      return hrefs;
    };

    expect(billingHrefs("OWNER")).toEqual(["/billing"]);
    expect(billingHrefs("MEMBER")).toEqual([]);
  });
});
