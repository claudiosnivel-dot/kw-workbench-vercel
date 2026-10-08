import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { marketingPath } from "@/lib/marketing/routes";

/**
 * Footer di landing, pagine pubbliche e app (T-1803, T-1805): pagine legali e supporto nella lingua corrente (/it o
 * /en, D-28 emendata). Nessun banner cookie: l'app imposta solo cookie tecnici (lib/legal/cookie-inventory.ts).
 */
export function SiteFooter() {
  const locale = useLocale();
  const t = useTranslations("footer");
  const links = [
    { href: marketingPath("privacy", locale), label: t("privacy") },
    { href: marketingPath("terms", locale), label: t("terms") },
    { href: marketingPath("cookies", locale), label: t("cookies") },
    { href: marketingPath("contact", locale), label: t("support") },
  ];

  return (
    <footer className="border-t border-[var(--surface-border)]">
      <nav
        aria-label={t("label")}
        className="mx-auto flex w-full max-w-[1180px] flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-slate-500 sm:px-6 lg:px-8"
      >
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="underline-offset-2 hover:underline">
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
