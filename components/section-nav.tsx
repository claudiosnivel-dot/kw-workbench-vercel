"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SectionNavItem = { href: string; label: string };

/**
 * Navigazione a sezioni delle aree del menu dell'utente (T-2801, variante «A» di D-41): Il tuo account, poi Workspace e
 * Amministrazione. La voce della pagina aperta ha aria-current=page e lo stile della voce attiva della barra laterale
 * del progetto; da 768 px sta a sinistra del contenuto, sotto va sopra come riga scorrevole.
 */
export function SectionNav({ label, items }: { label: string; items: SectionNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="section-nav">
      <ul className="section-nav-list">
        {items.map((item) => {
          const current = item.href === pathname;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`section-nav-link ${current ? "is-current" : ""}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
