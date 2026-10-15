// Gate di T-2801 (AC-2801-1): la navigazione a sezioni comune alle aree del menu dell'utente segna la pagina aperta.
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SectionNav } from "@/components/section-nav";
import { renderWithIntl } from "./intl";

vi.mock("next/navigation", () => ({
  usePathname: () => "/account/preferences",
}));

const ACCOUNT_ITEMS = [
  { href: "/account", label: "Profilo" },
  { href: "/account/security", label: "Accesso" },
  { href: "/account/preferences", label: "Preferenze" },
  { href: "/account/connections", label: "Collegamenti" },
  { href: "/account/data", label: "I tuoi dati" },
];

describe("navigazione a sezioni", () => {
  // covers: AC-2801-1
  it("con il pathname /account/preferences solo la voce Preferenze è la pagina corrente", () => {
    renderWithIntl(<SectionNav label="Menu del tuo account" items={ACCOUNT_ITEMS} />);

    const nav = screen.getByRole("navigation", { name: "Menu del tuo account" });
    const links = within(nav).getAllByRole("link");
    const current = links.filter((link) => link.getAttribute("aria-current") === "page");

    expect(links).toHaveLength(5);
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Preferenze");
    expect(current[0]).toHaveAttribute("href", "/account/preferences");
  });
});
