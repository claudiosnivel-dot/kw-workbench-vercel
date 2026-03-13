"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LogoutButton } from "@/components/logout-button";

function isAuthRoute(pathname: string): boolean {
  return pathname.startsWith("/login") || pathname.startsWith("/register");
}

function buildNavLinks(showAdminLink: boolean) {
  const links = [
    { href: "/", label: "Panoramica" },
    { href: "/settings/integrations", label: "Impostazioni" },
    { href: "/projects/new", label: "Nuovo progetto" },
  ];

  if (showAdminLink) {
    links.push({ href: "/admin", label: "Admin" });
  }

  return links;
}

export function TopNav({
  brandName,
  brandLogoUrl,
  showAdminLink = false,
}: {
  brandName: string;
  brandLogoUrl?: string;
  showAdminLink?: boolean;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const normalizedBrandName = useMemo(() => {
    const clean = brandName.trim();
    return clean || "Seo God Mode";
  }, [brandName]);

  const navLinks = useMemo(() => buildNavLinks(showAdminLink), [showAdminLink]);
  const authView = isAuthRoute(pathname);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[rgba(3,10,24,0.78)] backdrop-blur-xl">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="group inline-flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-900/90 shadow-sm ring-1 ring-white/15 transition group-hover:scale-[1.02]">
              {brandLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brandLogoUrl} alt={`${normalizedBrandName} logo`} className="h-full w-full object-contain" />
              ) : (
                <span className="font-heading text-base font-semibold text-emerald-300">{normalizedBrandName.slice(0, 1).toUpperCase()}</span>
              )}
            </span>
            <span className="font-heading truncate text-lg font-semibold tracking-tight text-slate-100">{normalizedBrandName}</span>
          </Link>

          {!authView && (
            <>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-slate-900/80 text-slate-200 md:hidden"
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
                {navLinks.map((item) => {
                  const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium transition ${
                        active
                          ? "bg-slate-800/90 text-slate-100 shadow-sm ring-1 ring-white/15"
                          : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-100"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
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
                  className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-slate-800/90 text-slate-100 shadow-sm ring-1 ring-white/15"
                      : "bg-slate-900/70 text-slate-300 ring-1 ring-white/10 hover:bg-slate-800/90"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <LogoutButton className="w-full justify-center rounded-xl px-4 py-2" />
          </nav>
        )}
      </div>
    </header>
  );
}