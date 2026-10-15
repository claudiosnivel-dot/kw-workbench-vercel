"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LogoutButton } from "@/components/logout-button";
import { MenuChevron } from "@/components/menu-chevron";
import { useMenuButton } from "@/lib/client/use-menu-button";
import { usePreferencePost } from "@/lib/client/use-preference-post";
import { SUPPORTED_LOCALES } from "@/lib/i18n/locale";
import { marketingPath } from "@/lib/marketing/routes";

export type WorkspaceOption = { id: string; name: string; isPersonal: boolean };

type UserMenuProps = {
  user: { displayName: string; email: string | null };
  /** true se l'utente ha billing.manage nel workspace attivo (T-2005), calcolato dal layout con la tabella dei permessi. */
  showBillingLink: boolean;
  /** true per il root admin (T-507): la pagina resta protetta lato server. */
  showAdminLink: boolean;
  /** Workspace dell'utente (T-1504): l'elenco per cambiare quello attivo compare solo se ce n'è più d'uno. */
  workspaces: WorkspaceOption[];
  activeWorkspaceId: string | null;
};

const ITEM_CLASS = "user-menu-item";

/**
 * Menu dell'utente nella barra in alto (T-2304, D-39): Il tuo account (T-2803), Workspace con il cambio del workspace
 * attivo (stessa richiesta del selettore di T-1504), Fatturazione per chi la gestisce, Amministrazione per il root
 * admin, Supporto, lingua ed Esci. Le voci nascoste lo sono per comodità: le pagine restano protette lato server.
 */
export function UserMenu({ user, showBillingLink, showAdminLink, workspaces, activeWorkspaceId }: UserMenuProps) {
  const t = useTranslations("nav");
  const tSwitcher = useTranslations("workspace.switcher");
  const tLocale = useTranslations("common.locale");
  const locale = useLocale();
  const { saving, save } = usePreferencePost();
  const { open, close, onKeyDown, wrapperRef, buttonRef, menuRef, buttonProps, menuProps } = useMenuButton();

  const links = [
    { href: "/account", label: t("yourAccount") },
    { href: "/workspace", label: t("workspace") },
    ...(showBillingLink ? [{ href: "/billing", label: t("billing") }] : []),
    ...(showAdminLink ? [{ href: "/admin", label: t("admin") }] : []),
    // Modulo contatti nella lingua corrente (T-1805).
    { href: marketingPath("contact", locale), label: t("support") },
  ];

  const choose = async (url: string, body: unknown) => {
    close();
    await save(url, body);
  };

  return (
    <div ref={wrapperRef} className="relative" onKeyDown={onKeyDown}>
      <button ref={buttonRef} {...buttonProps} aria-label={t("userMenu", { name: user.displayName })} className="user-menu-button">
        <span className="user-menu-avatar" aria-hidden="true">
          {user.displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-[12rem] truncate sm:inline">{user.displayName}</span>
        <MenuChevron />
      </button>

      {open && (
        <div className="user-menu-popover">
          <p className="user-menu-identity">
            <span className="block truncate text-sm font-medium">{user.displayName}</span>
            {user.email && <span className="block truncate text-xs text-slate-500">{user.email}</span>}
          </p>
          <div ref={menuRef} {...menuProps} aria-label={t("userMenu", { name: user.displayName })} className="grid gap-0.5">
            {links.map((link) => (
              <Link key={link.href} href={link.href} role="menuitem" tabIndex={-1} className={ITEM_CLASS} onClick={close}>
                {link.label}
              </Link>
            ))}

            {workspaces.length > 1 && activeWorkspaceId && (
              <div role="group" aria-label={tSwitcher("label")} className="user-menu-group">
                {workspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={workspace.id === activeWorkspaceId}
                    tabIndex={-1}
                    disabled={saving}
                    className={ITEM_CLASS}
                    onClick={() =>
                      workspace.id === activeWorkspaceId
                        ? close()
                        : choose("/api/workspaces/active", { workspaceId: workspace.id })
                    }
                  >
                    {workspace.isPersonal ? tSwitcher("personal", { name: workspace.name }) : workspace.name}
                  </button>
                ))}
              </div>
            )}

            <div role="group" aria-label={tLocale("label")} className="user-menu-group">
              {SUPPORTED_LOCALES.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option === locale}
                  tabIndex={-1}
                  disabled={saving}
                  lang={option}
                  className={ITEM_CLASS}
                  onClick={() => (option === locale ? close() : choose("/api/locale", { locale: option }))}
                >
                  {tLocale(option)}
                </button>
              ))}
            </div>

            <div role="separator" className="user-menu-separator" />
            <LogoutButton role="menuitem" className={ITEM_CLASS} />
          </div>
        </div>
      )}
    </div>
  );
}
