// Gate di T-808 (AC-808-4, parte dei pulsanti di riordino): frecce visibili e nome accessibile con la sezione.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SectionOrderButtons } from "@/components/section-order-buttons";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("SectionOrderButtons", () => {
  // covers: AC-808-4
  it("mostra ↑ e ↓ con nome accessibile che cita la sezione, senza '?'", () => {
    const { container } = render(<SectionOrderButtons projectId="p1" subprojectId="s1" subprojectName="Blog" />);

    const up = screen.getByRole("button", { name: "Sposta in alto la sezione Blog" });
    const down = screen.getByRole("button", { name: "Sposta in basso la sezione Blog" });

    expect(up).toHaveTextContent("↑");
    expect(down).toHaveTextContent("↓");
    expect(container.textContent).not.toContain("?");
  });
});
