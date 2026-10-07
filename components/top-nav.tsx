"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LogoutButton } from "@/components/logout-button";

function isAuthRoute(pathname: string): boolean {
  return pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/onboarding");
}

type NavLabelKey = "overview" | "personalize" | "newProject" | "admin";

function buildNavLinks(showAdminLink: boolean) {
  const links: { href: string; labelKey: NavLabelKey }[] = [
    { href: "/", labelKey: "overview" },
    { href: "/personalizza", labelKey: "personalize" },
    { href: "/projects/new", labelKey: "newProject" },
  ];

  if (showAdminLink) {
    links.push({ href: "/admin", labelKey: "admin" });
  }

  return links;
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
}: {
  brandName: string;
  brandLogoUrlDark?: string;
  brandLogoUrlLight?: string;
  brandLogoUrlLegacy?: string;
  themeMode: "DARK" | "LIGHT";
  showAdminLink?: boolean;
}) {
  const t = useTranslations("nav");
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
  const navLinks = useMemo(() => buildNavLinks(showAdminLink), [showAdminLink]);
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

  return (
    <header className="top-nav-shell sticky top-0 z-40">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" aria-label={normalizedBrandName} className="group inline-flex min-w-0 items-center gap-3">
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

              <nav className="hidden items-center gap-2 md:flex">
                {navLinks.map((item) => {
                  const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`top-nav-link inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium transition ${
                        active ? "is-active" : ""
                      }`}
                    >
                      {t(item.labelKey)}
                    </Link>
                  );
                })}
                <LocaleSwitcher />
                <LogoutButton className="px-4 py-2" />
              </nav>
            </>
          )}
        </div>

        {!authView && menuOpen && (
          <nav id="mobile-nav" className="mt-3 grid gap-2 md:hidden">
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
            <LocaleSwitcher className="w-full" />
            <LogoutButton className="w-full justify-center rounded-xl px-4 py-2" />
          </nav>
        )}
      </div>
    </header>
  );
}
