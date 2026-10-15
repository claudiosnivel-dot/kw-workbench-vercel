// Gate di T-3303 (AC-3303-1…3): i totali degli utenti diventano filtri a pulsante con il conteggio e «Crea utente» apre
// una finestra che, dopo la creazione, si chiude e ricarica l'elenco.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminUsersDashboard } from "@/components/admin-users-dashboard";
import { renderWithIntl } from "./intl";

const fetchMock = vi.fn<typeof fetch>();

const ROOT_TOTALS = { totalUsers: 14, totalActive: 13, totalSuspended: 1, totalAdmins: 2, totalSubscribers: 12 };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** GET /api/admin/users con l'elenco vuoto e i totali dati; POST /api/admin/users con 201. */
function serveUsers(totals: Record<string, number | null>) {
  fetchMock.mockImplementation(async (_url, init) => {
    if (init?.method === "POST") {
      return json({ data: { id: "u-new" } }, 201);
    }
    return json({ data: { users: [], totals, page: 1, pageSize: 50, total: 0 } });
  });
}

function listCalls() {
  return fetchMock.mock.calls.filter(([url, init]) => String(url).startsWith("/api/admin/users?") && init?.method === "GET");
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("filtri e creazione degli utenti nell'amministrazione", () => {
  // covers: AC-3303-1
  it("il filtro «Sospesi 1» chiede gli utenti con status SUSPENDED ed è premuto", async () => {
    serveUsers(ROOT_TOTALS);
    renderWithIntl(<AdminUsersDashboard viewer={{ id: "root", isRootAdmin: true }} />);

    const suspended = await screen.findByRole("button", { name: "Sospesi 1" });
    const before = listCalls().length;
    fireEvent.click(suspended);

    await waitFor(() => expect(listCalls().length).toBe(before + 1));
    const next = new URL(String(listCalls()[before][0]), "http://localhost");
    expect(next.searchParams.get("status")).toBe("SUSPENDED");
    expect(screen.getByRole("button", { name: "Sospesi 1" })).toHaveAttribute("aria-pressed", "true");
  });

  // covers: AC-3303-2
  it("per l'admin non root, con totalAdmins null, non c'è il filtro «Admin»", async () => {
    serveUsers({ ...ROOT_TOTALS, totalAdmins: null });
    renderWithIntl(<AdminUsersDashboard viewer={{ id: "admin", isRootAdmin: false }} />);

    const filters = await screen.findByRole("group", { name: "Filtra gli utenti" });
    await within(filters).findByRole("button", { name: "Sospesi 1" });

    expect(within(filters).queryByText(/Admin/)).toBeNull();
  });

  // covers: AC-3303-3
  it("«Crea utente» invia POST /api/admin/users dalla finestra, la chiude e ricarica l'elenco", async () => {
    serveUsers(ROOT_TOTALS);
    renderWithIntl(<AdminUsersDashboard viewer={{ id: "root", isRootAdmin: true }} />);
    await screen.findByRole("button", { name: "Sospesi 1" });
    const before = listCalls().length;

    fireEvent.click(screen.getByRole("button", { name: "Crea utente" }));
    const dialog = screen.getByRole("dialog", { name: "Crea utente" });
    fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "nuovo@example.com" } });
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "una-password-di-prova" } });
    fireEvent.change(within(dialog).getByLabelText("Conferma password"), { target: { value: "una-password-di-prova" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crea" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe("/api/admin/users");
    expect(JSON.parse(String(posts[0][1]?.body)).email).toBe("nuovo@example.com");
    await waitFor(() => expect(listCalls().length).toBe(before + 1));
  });
});
