// Gate di T-2305 (AC-2305-3): il menu ⋯ della scheda di un progetto mostra Elimina solo a chi ha project.delete.
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectCardMenu } from "@/components/project-card-menu";
import { canPerform } from "@/lib/authz/permissions";
import { renderWithIntl } from "./intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function menuItems(role: "MEMBER" | "ADMIN"): string[] {
  renderWithIntl(<ProjectCardMenu project={{ id: "P", name: "Negozio" }} canDelete={canPerform(role, "project.delete")} />);
  fireEvent.click(screen.getByRole("button", { name: "Azioni del progetto Negozio" }));
  const items = within(screen.getByRole("menu"))
    .getAllByRole("menuitem")
    .map((item) => item.textContent ?? "");
  cleanup();
  return items;
}

describe("ProjectCardMenu", () => {
  // covers: AC-2305-3
  it("il MEMBER vede Rinomina e Impostazioni senza Elimina; l'ADMIN anche Elimina", () => {
    expect(menuItems("MEMBER")).toEqual(["Rinomina", "Impostazioni"]);
    expect(menuItems("ADMIN")).toEqual(["Rinomina", "Impostazioni", "Elimina"]);
  });

  it("Elimina apre un dialogo di conferma con il nome del progetto", () => {
    renderWithIntl(<ProjectCardMenu project={{ id: "P", name: "Negozio" }} canDelete />);
    fireEvent.click(screen.getByRole("button", { name: "Azioni del progetto Negozio" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Elimina" }));

    const dialog = screen.getByRole("dialog", { name: "Eliminare il progetto?" });
    expect(dialog).toHaveTextContent('Eliminare il progetto "Negozio"?');
    expect(within(dialog).getByRole("button", { name: "Elimina" })).toHaveClass("btn-danger");
  });
});
