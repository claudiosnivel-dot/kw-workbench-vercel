// Gate di T-507 (AC-507-4): ricerca con debounce di 300 ms e richieste superate annullate.
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminUsersDashboard } from "@/components/admin-users-dashboard";
import { renderWithIntl } from "./intl";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function searchTextOf(call: Parameters<typeof fetch>): string | null {
  return new URL(String(call[0]), "http://localhost").searchParams.get("searchText");
}

describe("ricerca utenti nella dashboard admin", () => {
  // covers: AC-507-4
  it("con 6 caratteri a 50 ms l'uno chiama fetch una sola volta dopo 300 ms e annulla la richiesta in corso", async () => {
    // Nessuna risposta arriva: il caricamento iniziale resta in corso quando parte la ricerca.
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    renderWithIntl(<AdminUsersDashboard viewer={{ id: "root", isRootAdmin: true }} />);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const initialSignal = fetchMock.mock.calls[0][1]?.signal;

    // impacted-by: T-1401 (la ricerca copre email e nome mostrato)
    const input = screen.getByLabelText("Cerca email o nome");
    const text = "mario1";
    for (let length = 1; length <= text.length; length += 1) {
      fireEvent.change(input, { target: { value: text.slice(0, length) } });
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
    }
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    const searchCalls = fetchMock.mock.calls.slice(1);
    expect(searchCalls).toHaveLength(1);
    expect(searchTextOf(searchCalls[0])).toBe(text);
    expect(initialSignal).toBeInstanceOf(AbortSignal);
    expect(initialSignal?.aborted).toBe(true);
  });
});
