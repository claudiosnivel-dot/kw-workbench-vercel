// Gate di T-2304 (AC-2304-1…3): barra in alto ridotta a marchio, progetto e menu dell'utente; voci per ruolo, tastiera
// del menu e cambio del workspace attivo con la stessa richiesta del selettore di T-1504.
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopNav } from "@/components/top-nav";
import { UserMenu } from "@/components/user-menu";
import { canPerform } from "@/lib/authz/permissions";
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
  it("nessuna barra ha link diretti alle pagine secondarie; Fatturazione all'OWNER, Amministrazione al root admin", () => {
    const cases = [
      { role: "MEMBER" as const, rootAdmin: false },
      { role: "OWNER" as const, rootAdmin: false },
      { role: "OWNER" as const, rootAdmin: true },
    ];

    const menus = cases.map(({ role, rootAdmin }) => {
      renderWithIntl(
        <TopNav
          brandName="Titan SEO"
          themeMode="DARK"
          user={USER}
          showBillingLink={canPerform(role, "billing.manage")}
          showAdminLink={rootAdmin}
        />
      );
      const barHrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
      const items = within(openMenu())
        .getAllByRole("menuitem")
        .map((item) => item.textContent);
      cleanup();
      return { barHrefs, items };
    });

    for (const { barHrefs } of menus) {
      expect(barHrefs).toEqual(["/"]);
      for (const href of ["/personalizza", "/projects/new", "/billing", "/admin"]) {
        expect(barHrefs).not.toContain(href);
      }
    }
    const [member, owner, rootAdmin] = menus.map((menu) => menu.items);
    expect(member).not.toContain("Fatturazione");
    expect(member).not.toContain("Amministrazione");
    expect(owner).toContain("Fatturazione");
    expect(owner).not.toContain("Amministrazione");
    expect(rootAdmin).toContain("Amministrazione");
    expect(member).toEqual(["Personalizza", "Account", "Workspace", "Supporto", "Esci"]);
  });

  // covers: AC-2304-2
  it("freccia giù due volte porta il focus alla seconda voce; Esc chiude il menu e torna al pulsante", () => {
    renderWithIntl(<UserMenu user={USER} showBillingLink={false} showAdminLink={false} workspaces={[]} activeWorkspaceId={null} />);
    const button = screen.getByRole("button", { name: "Menu di Giulia" });
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    const menu = openMenu();
    expect(button).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(document.activeElement).toBe(within(menu).getAllByRole("menuitem")[1]);
    expect(document.activeElement).toHaveTextContent("Account");

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(button);
  });

  // covers: AC-2304-3
  it("scegliere il secondo workspace dal menu invia POST /api/workspaces/active con il suo id", async () => {
    renderWithIntl(
      <UserMenu
        user={USER}
        showBillingLink={false}
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
