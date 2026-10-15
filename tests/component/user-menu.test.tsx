// Gate di T-2304 (AC-2304-1…3): barra in alto ridotta a marchio, progetto e menu dell'utente; voci per ruolo, tastiera
// del menu e cambio del workspace attivo con la stessa richiesta del selettore di T-1504. Gate di T-2803 (AC-2803-1): la
// voce «Il tuo account» prende il posto di Personalizza e Account. Gate di T-3103 (AC-3103-1…3): «Nuovo workspace…» apre
// la finestra che crea il workspace con POST /api/workspaces e la voce Fatturazione esce dal menu.
// impacted-by: T-2803 (AC-2304-1 emendato: il menu di MEMBER, OWNER e root admin ha «Il tuo account» verso /account)
// impacted-by: T-3103 (AC-2304-1 emendato: nessun menu ha la voce Fatturazione, nemmeno quello dell'OWNER)
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopNav } from "@/components/top-nav";
import { UserMenu } from "@/components/user-menu";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => router,
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const USER = { displayName: "Giulia", email: "giulia@example.test" };

function openMenu(): HTMLElement {
  const button = screen.getByRole("button", { name: "Menu di Giulia" });
  button.focus();
  fireEvent.click(button);
  return screen.getByRole("menu");
}

describe("barra in alto e menu dell'utente", () => {
  // covers: AC-2304-1
  it("nessuna barra ha link diretti alle pagine secondarie; nessun menu ha Fatturazione, Amministrazione al root admin", () => {
    const cases = [
      { role: "MEMBER" as const, rootAdmin: false },
      { role: "OWNER" as const, rootAdmin: false },
      { role: "OWNER" as const, rootAdmin: true },
    ];

    // Il ruolo non cambia più le voci: la fatturazione è la sezione Piano del workspace (T-3102).
    const menus = cases.map(({ rootAdmin }) => {
      renderWithIntl(<TopNav brandName="Titan SEO" themeMode="DARK" user={USER} showAdminLink={rootAdmin} />);
      const barHrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
      const menuItems = within(openMenu()).getAllByRole("menuitem");
      const items = menuItems.map((item) => item.textContent);
      const itemHrefs = menuItems.map((item) => item.getAttribute("href"));
      cleanup();
      return { barHrefs, items, itemHrefs };
    });

    for (const { barHrefs, items, itemHrefs } of menus) {
      expect(barHrefs).toEqual(["/"]);
      for (const href of ["/personalizza", "/projects/new", "/billing", "/admin"]) {
        expect(barHrefs).not.toContain(href);
      }
      expect(items[itemHrefs.indexOf("/account")]).toBe("Il tuo account");
      expect(itemHrefs).not.toContain("/personalizza");
    }
    const [member, owner, rootAdmin] = menus.map((menu) => menu.items);
    expect(member).not.toContain("Fatturazione");
    expect(member).not.toContain("Amministrazione");
    expect(owner).not.toContain("Fatturazione");
    expect(owner).not.toContain("Amministrazione");
    expect(rootAdmin).toContain("Amministrazione");
    expect(member).toEqual(["Il tuo account", "Workspace", "Supporto", "Esci"]);
  });

  // covers: AC-2304-2
  it("freccia giù due volte porta il focus alla seconda voce; Esc chiude il menu e torna al pulsante", () => {
    renderWithIntl(<UserMenu user={USER} showAdminLink={false} workspaces={[]} activeWorkspaceId={null} />);
    const button = screen.getByRole("button", { name: "Menu di Giulia" });
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    const menu = openMenu();
    expect(button).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(document.activeElement).toBe(within(menu).getAllByRole("menuitem")[1]);
    expect(document.activeElement).toHaveTextContent("Workspace");

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(button);
  });

  // covers: AC-2803-1
  it("il menu di un MEMBER ha una sola voce «Il tuo account» verso /account e nessuna voce Personalizza", () => {
    renderWithIntl(<UserMenu user={USER} showAdminLink={false} workspaces={[]} activeWorkspaceId={null} />);
    const items = within(openMenu()).getAllByRole("menuitem");

    const account = items.filter((item) => item.textContent === "Il tuo account");
    expect(account).toHaveLength(1);
    expect(account[0]).toHaveAttribute("href", "/account");
    expect(items.filter((item) => item.getAttribute("href") === "/personalizza")).toHaveLength(0);
    expect(items.filter((item) => item.textContent === "Personalizza")).toHaveLength(0);
  });

  // covers: AC-2304-3
  it("scegliere il secondo workspace dal menu invia POST /api/workspaces/active con il suo id", async () => {
    renderWithIntl(
      <UserMenu
        user={USER}
        showAdminLink={false}
        workspaces={[
          { id: "ws-personal", name: "Giulia", isPersonal: true },
          { id: "ws-team", name: "Squadra", isPersonal: false },
        ]}
        activeWorkspaceId="ws-personal"
      />
    );

    fireEvent.click(within(openMenu()).getByRole("menuitemradio", { name: "Squadra" }));

    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/workspaces/active");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ workspaceId: "ws-team" });
  });
});

describe("nuovo workspace dal menu dell'utente", () => {
  const ONE_WORKSPACE = [{ id: "ws-personal", name: "Giulia", isPersonal: true }];

  /** Menu di un OWNER con il solo workspace personale: «Nuovo workspace…» apre la finestra con il nome. */
  function openNewWorkspaceDialog(): HTMLElement {
    renderWithIntl(<UserMenu user={USER} showAdminLink={false} workspaces={ONE_WORKSPACE} activeWorkspaceId="ws-personal" />);
    fireEvent.click(within(openMenu()).getByRole("menuitem", { name: "Nuovo workspace…" }));
    return screen.getByRole("dialog", { name: "Nuovo workspace" });
  }

  beforeEach(() => {
    router.refresh.mockReset();
  });

  // covers: AC-3103-1
  it("«Nuovo workspace…» crea il workspace con il nome scritto, chiude la finestra e aggiorna la pagina", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { id: "ws-new", name: "Clienti 2027" } }, { status: 201 }));
    const dialog = openNewWorkspaceDialog();

    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "Clienti 2027" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crea" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/workspaces");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ name: "Clienti 2027" });
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  // covers: AC-3103-2
  it("con un nome vuoto l'errore della rotta compare in un elemento role alert e la finestra resta aperta", async () => {
    fetchMock.mockResolvedValue(Response.json({ code: "VALIDATION_ERROR", error: "Nome non valido" }, { status: 400 }));
    const dialog = openNewWorkspaceDialog();

    fireEvent.click(within(dialog).getByRole("button", { name: "Crea" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Dati non validi: controlla i campi e riprova.");
    expect(screen.getByRole("dialog", { name: "Nuovo workspace" })).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ name: "" });
    expect(router.refresh).not.toHaveBeenCalled();
  });

  // covers: AC-3103-3
  it("il menu dell'OWNER non ha la voce Fatturazione né link a /billing e ha una voce Workspace verso /workspace", () => {
    renderWithIntl(<UserMenu user={USER} showAdminLink={false} workspaces={ONE_WORKSPACE} activeWorkspaceId="ws-personal" />);
    const items = within(openMenu()).getAllByRole("menuitem");

    expect(items.filter((item) => item.getAttribute("href") === "/billing" || item.textContent === "Fatturazione")).toHaveLength(0);
    const workspace = items.filter((item) => item.textContent === "Workspace");
    expect(workspace).toHaveLength(1);
    expect(workspace[0]).toHaveAttribute("href", "/workspace");
  });
});
