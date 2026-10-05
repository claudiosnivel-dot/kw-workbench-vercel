// Gate di T-808 (AC-808-4, parte del form): in creazione senza redirect il form torna vuoto dopo il 201.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubprojectForm } from "@/components/subproject-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SubprojectForm in creazione", () => {
  // covers: AC-808-4
  it("dopo una risposta 201 riporta il nome della sezione a stringa vuota", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "s-nuova" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );
    render(<SubprojectForm mode="create" projectId="p1" showAdvanced={false} />);
    const name = screen.getByLabelText("Nome sezione") as HTMLInputElement;

    fireEvent.change(name, { target: { value: "Nuova sezione" } });
    expect(name.value).toBe("Nuova sezione");
    fireEvent.submit(name.closest("form")!);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(name.value).toBe(""));
  });
});
