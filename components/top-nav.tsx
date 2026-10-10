"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LogoutButton } from "@/components/logout-button";
import { type WorkspaceOption, WorkspaceSwitcher } from "@/components/workspace-switcher";
import type { AppLocale } from "@/lib/i18n/locale";
import { findMarketingRoute, marketingPath } from "@/lib/marketing/routes";

// Pagine di accesso e dei link delle email (T-1403…T-1405): la navbar mostra solo il marchio.
const AUTH_ROUTE_PREFIXES = [
  "/login",
  "/register",
  "/onboarding",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/accept-terms",
];

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Nome mostrato ed email dell'utente della sessione (T-1401): mai nel cookie, letti dal DB dal layout. */
function UserIdentity({ user, className }: { user: { displayName: string; email: string | null }; className: string }) {
  return (
    <span className={`min-w-0 flex-col leading-tight ${className}`}>
      <span className="truncate text-sm font-medium">{user.displayName}</span>
      {user.email && <span className="truncate text-xs text-slate-500">{user.email}</span>}
    </span>
  );
}

type NavLabelKey = "overview" | "personalize" | "newProject" | "billing" | "admin" | "support";

function buildNavLinks(showAdminLink: boolean, showBillingLink: boolean, locale: AppLocale) {
  const links: { href: string; labelKey: NavLabelKey }[] = [
    { href: "/", labelKey: "overview" },
    { href: "/personalizza", labelKey: "personalize" },
    { href: "/projects/new", labelKey: "newProject" },
  ];

  // Fatturazione del workspace attivo per chi ha billing.manage (T-2005); la pagina resta leggibile da tutti i membri.
  if (showBillingLink) {
    links.push({ href: "/billing", labelKey: "billing" });
  }

  if (showAdminLink) {
    links.push({ href: "/admin", labelKey: "admin" });
  }

  // Modulo contatti nella lingua corrente (T-1805).
  links.push({ href: marketingPath("contact", locale), labelKey: "support" });
  return links;
}

/**
 * Voci della barra per gli anonimi (T-1801): prezzi, accesso, registrazione e lingua; nessun link dell'app né logout.
 * Sulle pagine pubbliche la lingua è un link alla stessa pagina nell'altra lingua (URL per lingua, D-28 emendata),
 * altrove il selettore a cookie di T-1301.
 */
function AnonymousNavItems({ pathname, linkClassName, mobile = false }: { pathname: string; linkClassName: string; mobile?: boolean }) {
  const t = useTranslations("nav");
  const tLocale = useTranslations("common.locale");
  const locale = useLocale();
  const alternate = findMarketingRoute(pathname)?.alternate;
  const otherLocale: AppLocale = locale === "it" ? "en" : "it";

  return (
    <>
      <Link href={marketingPath("pricing", locale)} className={linkClassName}>
        {t("pricing")}
      </Link>
      <Link href="/login" className={linkClassName}>
        {t("login")}
      </Link>
      <Link href="/register" className={`btn-primary ${mobile ? "w-full text-center" : ""}`}>
        {t("register")}
      </Link>
      {alternate ? (
        <Link href={alternate} hrefLang={otherLocale} lang={otherLocale} aria-label={tLocale("label")} className={linkClassName}>
          {tLocale(otherLocale)}
        </Link>
      ) : (
        <LocaleSwitcher className={mobile ? "w-full" : undefined} />
      )}
    </>
  );
}

function normalizeLogoUrl(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function normalizeThemeMode(value: string | null | undefined): "DARK" | "LIGHT" | null {
  if (value === "DARK" || value === "LIGHT") {
    return value;
  }

  return null;
}

function resolveLogoUrl(input: {
  themeMode: "DARK" | "LIGHT";
  dark?: string;
  light?: string;
  legacy?: string;
}): string {
  const dark = normalizeLogoUrl(input.dark);
  const light = normalizeLogoUrl(input.light);
  const legacy = normalizeLogoUrl(input.legacy);

  if (input.themeMode === "LIGHT") {
    return light || dark || legacy;
  }

  return dark || light || legacy;
}

export function TopNav({
  brandName,
  brandLogoUrlDark,
  brandLogoUrlLight,
  brandLogoUrlLegacy,
  themeMode,
  showAdminLink = false,
  showBillingLink = false,
  user = null,
  workspaces = [],
  activeWorkspaceId = null,
}: {
  brandName: string;
  brandLogoUrlDark?: string;
  brandLogoUrlLight?: string;
  brandLogoUrlLegacy?: string;
  themeMode: "DARK" | "LIGHT";
  showAdminLink?: boolean;
  /** true se l'utente ha billing.manage nel workspace attivo (T-2005), calcolato dal layout con la tabella dei permessi. */
  showBillingLink?: boolean;
  user?: { displayName: string; email: string | null } | null;
  /** Workspace dell'utente (T-1504): il selettore compare solo se ce n'è più d'uno tra cui scegliere. */
  workspaces?: WorkspaceOption[];
  activeWorkspaceId?: string | null;
}) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeThemeMode, setActiveThemeMode] = useState<"DARK" | "LIGHT">(themeMode);

  const normalizedBrandName = useMemo(() => {
    const clean = brandName.trim();
    return clean || "Seo God Mode";
  }, [brandName]);

  const resolvedLogoUrl = useMemo(
    () =>
      resolveLogoUrl({
        themeMode: activeThemeMode,
        dark: brandLogoUrlDark,
        light: brandLogoUrlLight,
        legacy: brandLogoUrlLegacy,
      }),
    [activeThemeMode, brandLogoUrlDark, brandLogoUrlLight, brandLogoUrlLegacy]
  );

  const hasCustomLogo = resolvedLogoUrl.length > 0;
  const navLinks = useMemo(
    () => buildNavLinks(showAdminLink, showBillingLink, locale),
    [showAdminLink, showBillingLink, locale]
  );
  const authView = isAuthRoute(pathname);
  const switcher =
    workspaces.length > 1 && activeWorkspaceId
      ? (className?: string) => <WorkspaceSwitcher workspaces={workspaces} activeId={activeWorkspaceId} className={className} />
      : null;

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    setActiveThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    const readThemeFromDom = () => normalizeThemeMode(document.documentElement.getAttribute("data-theme"));

    const syncTheme = () => {
      const next = readThemeFromDom();
      if (next) {
        setActiveThemeMode((current) => (current === next ? current : next));
      }
    };

    syncTheme();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "data-theme") {
          syncTheme();
          break;
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <header className="top-nav-shell sticky top-0 z-40">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" aria-label={normalizedBrandName} className="group inline-flex min-w-0 items-center gap-3 xl:shrink-0">
            {hasCustomLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolvedLogoUrl} alt={normalizedBrandName} className="top-nav-logo-image" />
            ) : (
              <>
                <span className="top-nav-logo flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl transition group-hover:scale-[1.02]">
                  <span className="top-nav-logo-fallback font-heading text-base font-semibold">
                    {normalizedBrandName.slice(0, 1).toUpperCase()}
                  </span>
                </span>
                <span className="top-nav-brand-name font-heading truncate text-lg font-semibold tracking-tight">{normalizedBrandName}</span>
              </>
            )}
          </Link>

          {!authView && (
            <>
              <button
                type="button"
                className="top-nav-menu-toggle inline-flex h-10 w-10 items-center justify-center rounded-xl md:hidden"
                onClick={() => setMenuOpen((current) => !current)}
                aria-expanded={menuOpen}
                aria-controls="mobile-nav"
                aria-label={t("openMenu")}
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>

              {/* Da xl marchio e voci restano interi: se lo spazio non basta si accorcia solo l'identità (T-2005). */}
              <nav className="hidden min-w-0 items-center gap-2 md:flex">
                {user ? (
                  <>
                    {navLinks.map((item) => {
                      const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`top-nav-link inline-flex items-center rounded-xl px-3 py-2 text-sm font-medium transition xl:whitespace-nowrap ${
                            active ? "is-active" : ""
                          }`}
                        >
                          {t(item.labelKey)}
                        </Link>
                      );
                    })}
                    <UserIdentity user={user} className="hidden max-w-[12rem] text-right xl:flex" />
                    {/* Nomi scelti dagli utenti (T-1504): il selettore non allarga la barra oltre 14rem. */}
                    {switcher?.("max-w-56")}
                    <LocaleSwitcher />
                    <LogoutButton className="px-4 py-2" />
                  </>
                ) : (
                  <AnonymousNavItems
                    pathname={pathname}
                    linkClassName="top-nav-link inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium transition"
                  />
                )}
              </nav>
            </>
          )}
        </div>

        {!authView && menuOpen && (
          <nav id="mobile-nav" className="mt-3 grid gap-2 md:hidden">
            {user ? (
              <>
                <UserIdentity user={user} className="flex px-1 text-center" />
                {navLinks.map((item) => {
                  const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={`top-nav-link top-nav-link-mobile inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition ${
                        active ? "is-active" : ""
                      }`}
                    >
                      {t(item.labelKey)}
                    </Link>
                  );
                })}
                {switcher?.("w-full")}
                <LocaleSwitcher className="w-full" />
                <LogoutButton className="w-full justify-center rounded-xl px-4 py-2" />
              </>
            ) : (
              <AnonymousNavItems
                pathname={pathname}
                linkClassName="top-nav-link top-nav-link-mobile inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition"
                mobile
              />
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
