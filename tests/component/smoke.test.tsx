import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LogoutButton } from "@/components/logout-button";
import { renderWithIntl } from "./intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("smoke component", () => {
  // covers: AC-101-3
  it("renderizza LogoutButton con un solo pulsante Esci", () => {
    renderWithIntl(<LogoutButton />);

    expect(screen.getAllByRole("button", { name: "Esci" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Esci" })).toBeInTheDocument();
  });
});
