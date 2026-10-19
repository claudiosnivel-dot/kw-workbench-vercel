"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { UserMenu, type WorkspaceOption } from "@/components/user-menu";
import { findMarketingRoute, marketingPath } from "@/lib/marketing/routes";

// Pagine di accesso e dei link delle email (T-1403…T-1405): la navbar mostra solo il marchio.
const AUTH_ROUTE_PREFIXES = [
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/email-change",
  "/accept-terms",
];

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Contenitore della barra in alto in cui la struttura del progetto (T-2303) porta il pulsante ☰ della barra laterale e
 * il menu dei progetti: la barra sta nel layout radice, i dati del progetto nel layout del progetto.
 */
export const PROJECT_NAV_SLOT_ID = "project-nav-slot";

/**
 * Voci della barra per gli anonimi (T-1801): prezzi, accesso, registrazione e lingua; nessun link dell'app né logout.
 * Sulle pagine pubbliche il selettore della lingua porta alla stessa pagina nella lingua scelta (URL per lingua, D-28
 * emendata; quattro lingue da T-4902), altrove salva la lingua nel cookie di T-1301.
 */
function AnonymousNavItems({ pathname, linkClassName, mobile = false }: { pathname: string; linkClassName: string; mobile?: boolean }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const alternates = findMarketingRoute(pathname)?.alternates;

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
      <LocaleSwitcher className={mobile ? "w-full" : undefined} alternates={alternates} />
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
  user?: { displayName: string; email: string | null } | null;
  /** Workspace dell'utente (T-1504): il selettore compare solo se ce n'è più d'uno tra cui scegliere. */
  workspaces?: WorkspaceOption[];
  activeWorkspaceId?: string | null;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeThemeMode, setActiveThemeMode] = useState<"DARK" | "LIGHT">(themeMode);

  const normalizedBrandName = useMemo(() => {
    const clean = brandName.trim();
    return clean || "Titan SEO";
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
  const authView = isAuthRoute(pathname);

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

  const appBar = Boolean(user) && !authView;
  // Nella barra dell'app, sotto i 640 px, il nome del marchio lascia spazio al progetto e al menu (T-2304).
  const brand = (
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
          <span
            className={`top-nav-brand-name font-heading truncate text-lg font-semibold tracking-tight ${appBar ? "hidden sm:inline" : ""}`}
          >
            {normalizedBrandName}
          </span>
        </>
      )}
    </Link>
  );

  return (
    <header className="top-nav-shell sticky top-0 z-40">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-3 sm:px-6 lg:px-8">
        {user && appBar ? (
          // Barra dell'app ridotta (T-2304, D-39): marchio, progetto corrente con il suo menu e menu dell'utente.
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              {brand}
              <div id={PROJECT_NAV_SLOT_ID} className="flex min-w-0 items-center gap-2" />
            </div>
            <UserMenu
              user={user}
              showAdminLink={showAdminLink}
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
            />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              {brand}

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

                  <nav className="hidden min-w-0 items-center gap-2 md:flex">
                    <AnonymousNavItems
                      pathname={pathname}
                      linkClassName="top-nav-link inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium transition"
                    />
                  </nav>
                </>
              )}
            </div>

            {!authView && menuOpen && (
              <nav id="mobile-nav" className="mt-3 grid gap-2 md:hidden">
                <AnonymousNavItems
                  pathname={pathname}
                  linkClassName="top-nav-link top-nav-link-mobile inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition"
                  mobile
                />
              </nav>
            )}
          </>
        )}
      </div>
    </header>
  );
}
