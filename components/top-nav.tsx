"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LogoutButton } from "@/components/logout-button";

const NAV_LINKS = [
  { href: "/", label: "Panoramica" },
  { href: "/settings/integrations", label: "Impostazioni" },
  { href: "/projects/new", label: "Nuovo progetto" },
] as const;

function isAuthRoute(pathname: string): boolean {
  return pathname.startsWith("/login") || pathname.startsWith("/register");
}

export function TopNav({ brandName, brandLogoUrl }: { brandName: string; brandLogoUrl?: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const normalizedBrandName = useMemo(() => {
    const clean = brandName.trim();
    return clean || "Seo God Mode";
  }, [brandName]);

  const authView = isAuthRoute(pathname);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/60 bg-[rgba(244,251,247,0.78)] backdrop-blur-xl">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="group inline-flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[var(--surface-border)] transition group-hover:scale-[1.02]">
              {brandLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brandLogoUrl} alt={`${normalizedBrandName} logo`} className="h-full w-full object-contain" />
              ) : (
                <span className="font-heading text-base font-semibold text-[var(--brand-700)]">{normalizedBrandName.slice(0, 1).toUpperCase()}</span>
              )}
            </span>
            <span className="font-heading truncate text-lg font-semibold tracking-tight text-slate-900">{normalizedBrandName}</span>
          </Link>

          {!authView && (
            <>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--surface-border)] bg-white text-slate-700 md:hidden"
                onClick={() => setMenuOpen((current) => !current)}
                aria-expanded={menuOpen}
                aria-controls="mobile-nav"
                aria-label="Apri menu"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>

              <nav className="hidden items-center gap-2 md:flex">
                {NAV_LINKS.map((item) => {
                  const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition ${
                        active
                          ? "bg-white text-slate-900 shadow-sm ring-1 ring-[var(--surface-border)]"
                          : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
                <LogoutButton className="rounded-full" />
              </nav>
            </>
          )}
        </div>

        {!authView && menuOpen && (
          <nav id="mobile-nav" className="mt-3 grid gap-2 md:hidden">
            {NAV_LINKS.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-[var(--surface-border)]"
                      : "bg-white/70 text-slate-700 ring-1 ring-[var(--surface-border)] hover:bg-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <LogoutButton className="w-full justify-center rounded-xl" />
          </nav>
        )}
      </div>
    </header>
  );
}